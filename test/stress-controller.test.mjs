import test from "node:test";
import assert from "node:assert/strict";

import { buildStressCorpus } from "../scripts/lib/trace-corpus.mjs";
import { runSimulatedTraceBenchmark } from "../scripts/lib/smoothness-harness.mjs";

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.floor((sorted.length - 1) * ratio);
  return sorted[index];
}

test("stress corpus of long traces keeps first paint and tail overhead bounded", async () => {
  const traces = buildStressCorpus({ count: 24 });
  const metrics = [];

  for (const trace of traces) {
    const result = await runSimulatedTraceBenchmark({ trace });
    metrics.push(result.metrics);
  }

  assert.ok(
    percentile(metrics.map((row) => row.firstVisibleLagMs), 0.95) <= 20,
    "expected stress corpus firstVisibleLag p95 <= 20",
  );
  assert.ok(
    percentile(metrics.map((row) => row.completionLagMs), 0.95) <= 480,
    "expected stress corpus completionLag p95 <= 480",
  );
  assert.ok(
    percentile(metrics.map((row) => row.velocityCv), 0.95) <= 0.85,
    "expected stress corpus velocityCv p95 <= 0.85",
  );
  assert.ok(
    percentile(metrics.map((row) => row.maxAvoidableStallMs), 0.95) <= 120,
    "expected stress corpus maxAvoidableStall p95 <= 120",
  );
});
