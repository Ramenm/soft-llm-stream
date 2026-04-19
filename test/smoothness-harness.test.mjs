import test from "node:test";
import assert from "node:assert/strict";

import { buildLongOutputBenchmarkCorpus } from "../scripts/lib/trace-corpus.mjs";
import {
  runRealtimeTraceBenchmark,
  runSimulatedTraceBenchmark,
} from "../scripts/lib/smoothness-harness.mjs";

const shortTrace = {
  name: "short-bursty-trace",
  events: [
    { delayMs: 0, text: "Hello" },
    { delayMs: 35, text: " there" },
    { delayMs: 35, text: ", general" },
    { delayMs: 140, text: " Kenobi." },
  ],
};

test("runSimulatedTraceBenchmark returns stable metrics and a final text", async () => {
  const result = await runSimulatedTraceBenchmark({ trace: shortTrace });

  assert.equal(result.traceName, "short-bursty-trace");
  assert.equal(result.finalSnapshot.status, "done");
  assert.equal(result.finalSnapshot.text, result.finalSnapshot.fullText);
  assert.ok(result.samples.length >= 3);
  assert.ok(Number.isFinite(result.metrics.velocityCv));
  assert.ok(Number.isFinite(result.metrics.meanJerk));
  assert.ok(result.metrics.timeToFirstVisibleMs >= 0);
});

test("runRealtimeTraceBenchmark also reaches a terminal snapshot", async () => {
  const result = await runRealtimeTraceBenchmark({ trace: shortTrace });

  assert.equal(result.finalSnapshot.status, "done");
  assert.equal(result.finalSnapshot.text, result.finalSnapshot.fullText);
  assert.ok(result.metrics.backlogHorizonBandCoverage >= 0);
});

test("runSimulatedTraceBenchmark handles long-output traces", async () => {
  const [longTrace] = buildLongOutputBenchmarkCorpus();
  const result = await runSimulatedTraceBenchmark({ trace: longTrace });

  assert.equal(result.finalSnapshot.status, "done");
  assert.equal(result.finalSnapshot.text, result.finalSnapshot.fullText);
  assert.ok(result.finalSnapshot.text.length >= 4000);
  assert.ok(result.samples.length >= 20);
});


test("runSimulatedTraceBenchmark reports delayed-batch burst metrics for historical dump regressions", async () => {
  const delayedBatchTrace = {
    name: "delayed-large-batch",
    events: [
      { delayMs: 0, text: "Hello" },
      { delayMs: 300, text: " x".repeat(200) },
    ],
  };
  const result = await runSimulatedTraceBenchmark({ trace: delayedBatchTrace });

  assert.equal(result.gapBurstMetrics.delayedLargeBatchCount, 1);
  assert.ok(
    result.gapBurstMetrics.maxFirstJumpShare <= 0.12,
    `expected maxFirstJumpShare <= 0.12, received ${result.gapBurstMetrics.maxFirstJumpShare}`,
  );
  assert.ok(
    result.gapBurstMetrics.maxFirstThreeJumpShare <= 0.25,
    `expected maxFirstThreeJumpShare <= 0.25, received ${result.gapBurstMetrics.maxFirstThreeJumpShare}`,
  );
  assert.ok(
    result.gapBurstMetrics.minUpdatesBeforeDrain >= 10,
    `expected minUpdatesBeforeDrain >= 10, received ${result.gapBurstMetrics.minUpdatesBeforeDrain}`,
  );
});


test("coarse-frame idle-gap recovery stays soft in the first 250ms and still advances by 750ms", async () => {
  const idleGapTrace = {
    name: "coarse-frame-idle-gap",
    events: [
      { delayMs: 0, text: "Hello" },
      { delayMs: 2200, text: " x".repeat(220) },
    ],
  };
  const result = await runSimulatedTraceBenchmark({
    trace: idleGapTrace,
    frameMs: 250,
  });

  assert.equal(result.gapBurstMetrics.delayedLargeBatchCount, 1);
  assert.ok(
    result.gapBurstMetrics.maxShareAfter250Ms <= 0.08,
    `expected maxShareAfter250Ms <= 0.08, received ${result.gapBurstMetrics.maxShareAfter250Ms}`,
  );
  assert.ok(
    result.gapBurstMetrics.maxShareAfter750Ms <= 0.18,
    `expected maxShareAfter750Ms <= 0.18, received ${result.gapBurstMetrics.maxShareAfter750Ms}`,
  );
  assert.ok(
    result.gapBurstMetrics.minShareAfter750Ms >= 0.08,
    `expected minShareAfter750Ms >= 0.08, received ${result.gapBurstMetrics.minShareAfter750Ms}`,
  );
});
