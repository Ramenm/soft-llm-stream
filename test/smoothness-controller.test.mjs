import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { runSimulatedTraceBenchmark } from "../scripts/lib/smoothness-harness.mjs";

async function loadTraceFixture(name) {
  const contents = await fs.readFile(
    new URL(`./fixtures/traces/${name}.json`, import.meta.url),
    "utf8",
  );
  return JSON.parse(contents);
}

const delayedFirstChunkTrace = {
  name: "delayed-first-chunk",
  events: [
    { delayMs: 535, text: "Hello" },
    { delayMs: 40, text: " there" },
    { delayMs: 40, text: ", smooth" },
    { delayMs: 40, text: " reveal." },
  ],
};

test("steady drip trace keeps velocity variation below the target threshold", async () => {
  const trace = await loadTraceFixture("steady-drip");
  const result = await runSimulatedTraceBenchmark({ trace });

  assert.ok(
    result.metrics.velocityCv <= 0.9,
    `expected velocityCv <= 0.9, received ${result.metrics.velocityCv}`,
  );
  assert.ok(
    result.metrics.maxAvoidableStallMs <= 120,
    `expected maxAvoidableStallMs <= 120, received ${result.metrics.maxAvoidableStallMs}`,
  );
});

test("completion tail trace avoids a large end-of-stream snap", async () => {
  const trace = await loadTraceFixture("completion-tail");
  const result = await runSimulatedTraceBenchmark({ trace });

  assert.ok(
    result.metrics.completionSnapFactor <= 3.05,
    `expected completionSnapFactor <= 3.05, received ${result.metrics.completionSnapFactor}`,
  );
  assert.ok(
    result.metrics.completionLagMs <= 420,
    `expected completionLagMs <= 420, received ${result.metrics.completionLagMs}`,
  );
});

test("delayed first chunk becomes visible within a single frame after arrival", async () => {
  const result = await runSimulatedTraceBenchmark({ trace: delayedFirstChunkTrace });

  assert.ok(
    result.metrics.firstVisibleLagMs <= 20,
    `expected firstVisibleLagMs <= 20, received ${result.metrics.firstVisibleLagMs}`,
  );
});

test("bursty and pausey traces stay inside the flow band most of the time", async () => {
  for (const name of ["bursty-gaps", "pause-recovery", "sawtooth-bursts"]) {
    const trace = await loadTraceFixture(name);
    const result = await runSimulatedTraceBenchmark({ trace });

    assert.ok(
      result.metrics.backlogHorizonBandCoverage >= 0.8,
      `expected ${name} band coverage >= 0.8, received ${result.metrics.backlogHorizonBandCoverage}`,
    );
    assert.ok(
      result.metrics.maxAvoidableStallMs <= 250,
      `expected ${name} maxAvoidableStallMs <= 250, received ${result.metrics.maxAvoidableStallMs}`,
    );
  }
});

test("dense script and code fence traces still finish cleanly", async () => {
  for (const name of ["dense-script", "code-fence-lines"]) {
    const trace = await loadTraceFixture(name);
    const result = await runSimulatedTraceBenchmark({ trace });

    assert.equal(result.finalSnapshot.status, "done");
    assert.equal(result.finalSnapshot.text, result.finalSnapshot.fullText);
  }
});


test("delayed large batch trace does not dump most backlog in the first simulated frames", async () => {
  const trace = {
    name: "delayed-large-batch",
    events: [
      { delayMs: 0, text: "Hello" },
      { delayMs: 300, text: " x".repeat(200) },
    ],
  };
  const result = await runSimulatedTraceBenchmark({ trace });
  const delayedBatchSampleIndex = result.samples.findIndex((sample) => sample.fullChars > 5);

  assert.ok(delayedBatchSampleIndex > 0, "expected a delayed batch sample");

  const beforeBatch = result.samples[delayedBatchSampleIndex - 1];
  const firstAfterBatch = result.samples[delayedBatchSampleIndex];
  const secondAfterBatch = result.samples[delayedBatchSampleIndex + 1];
  const thirdAfterBatch = result.samples[delayedBatchSampleIndex + 2];
  const batchChars = firstAfterBatch.fullChars - beforeBatch.fullChars;

  assert.ok(batchChars >= 400, `expected batchChars >= 400, received ${batchChars}`);
  assert.ok(
    (firstAfterBatch.visibleChars - beforeBatch.visibleChars) / batchChars <= 0.12,
    "expected the first simulated reveal step after a delayed large batch to stay below 12% of the batch",
  );
  assert.ok(
    (thirdAfterBatch.visibleChars - beforeBatch.visibleChars) / batchChars <= 0.25,
    "expected the first three simulated reveal steps after a delayed large batch to stay below 25% of the batch",
  );
});

test("fresh backlog after a long idle gap resumes visible motion without a near-frozen crawl", async () => {
  const trace = {
    name: "idle-gap-recovery",
    events: [
      {
        delayMs: 1800,
        text:
          "The first visible batch is small and reassuring, like the assistant has started responding before it calls a tool or waits on some extra backend work.",
      },
      {
        delayMs: 2400,
        text:
          " A second batch follows quickly with a little more context, giving the user hope that the answer will continue normally.",
      },
      {
        delayMs: 13200,
        text:
          " Then everything stalls for a long tool call gap while the UI appears frozen, which is exactly the kind of frustrating real-world pause this scenario is meant to demonstrate.",
      },
    ],
  };

  const result = await runSimulatedTraceBenchmark({ trace });
  const recoveryBatchIndex = result.samples.findIndex((sample, index) => {
    if (index === 0) {
      return false;
    }

    return (
      sample.fullChars > result.samples[index - 1].fullChars &&
      sample.timestampMs >= 17400
    );
  });

  assert.ok(recoveryBatchIndex > 0, "expected a delayed recovery batch sample");

  const beforeBatch = result.samples[recoveryBatchIndex - 1];
  const firstAfterBatch = result.samples[recoveryBatchIndex];
  const sixthAfterBatch = result.samples[recoveryBatchIndex + 5];
  const tenthAfterBatch = result.samples[recoveryBatchIndex + 9];
  const batchChars = firstAfterBatch.fullChars - beforeBatch.fullChars;

  assert.ok(batchChars >= 160, `expected batchChars >= 160, received ${batchChars}`);
  assert.ok(
    (firstAfterBatch.visibleChars - beforeBatch.visibleChars) / batchChars <= 0.08,
    "expected the first reveal step after a long idle gap to stay soft rather than dumping the batch",
  );
  assert.ok(
    (sixthAfterBatch.visibleChars - beforeBatch.visibleChars) / batchChars >= 0.04,
    "expected the first ~100ms after a long idle gap to show noticeable progress instead of a near-frozen crawl",
  );
  assert.ok(
    (tenthAfterBatch.visibleChars - beforeBatch.visibleChars) / batchChars <= 0.16,
    "expected early recovery motion to stay controlled instead of rushing through the batch",
  );
});
