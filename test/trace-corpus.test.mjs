import test from "node:test";
import assert from "node:assert/strict";

import { summarizeTrace } from "../scripts/lib/random-trace.mjs";
import {
  buildExtremeBenchmarkCorpus,
  buildIdleGapBenchmarkCorpus,
  buildLongOutputBenchmarkCorpus,
  buildStressCorpus,
} from "../scripts/lib/trace-corpus.mjs";

test("buildLongOutputBenchmarkCorpus includes multi-thousand-character traces", () => {
  const traces = buildLongOutputBenchmarkCorpus();
  const stats = traces.map((trace) => summarizeTrace(trace));

  assert.equal(traces.length, 5);
  assert.ok(traces.some((trace) => trace.name.includes("grow")));
  assert.ok(traces.some((trace) => trace.name.includes("shrink")));
  assert.ok(stats.every((row) => row.totalChars >= 4000));
  assert.ok(stats.some((row) => row.meanChunkChars >= 80));
  assert.ok(stats.some((row) => row.p90ChunkChars >= 120));
});

test("buildStressCorpus mixes tiny-chunk and long-form traces", () => {
  const traces = buildStressCorpus({ count: 30 });
  const stats = traces.map((trace) => summarizeTrace(trace));
  const totalChars = stats.map((row) => row.totalChars);
  const meanChunkChars = stats.map((row) => row.meanChunkChars);

  assert.equal(traces.length, 30);
  assert.ok(Math.min(...totalChars) <= 1200);
  assert.ok(Math.max(...totalChars) >= 2500);
  assert.ok(Math.min(...meanChunkChars) <= 1.5);
  assert.ok(Math.max(...meanChunkChars) >= 60);
});


test("buildExtremeBenchmarkCorpus covers pathological 50k-token-ish traces", () => {
  const traces = buildExtremeBenchmarkCorpus({ targetTokens: 12000, scale: 0.35 });
  const stats = traces.map((trace) => summarizeTrace(trace));
  const firstDelays = stats.map((row) => row.firstDelayMs);
  const totalChars = stats.map((row) => row.totalChars);
  const meanChunkChars = stats.map((row) => row.meanChunkChars);
  const maxGaps = stats.map((row) => row.maxGapMs);

  assert.equal(traces.length, 5);
  assert.ok(traces.some((trace) => trace.name.includes("ramp-up")));
  assert.ok(traces.some((trace) => trace.name.includes("chaos")));
  assert.ok(Math.max(...firstDelays) >= 3000);
  assert.ok(Math.max(...totalChars) >= 18000);
  assert.ok(Math.max(...meanChunkChars) >= 90);
  assert.ok(Math.max(...maxGaps) >= 900);
});

test("buildIdleGapBenchmarkCorpus includes minute-scale idle windows", () => {
  const traces = buildIdleGapBenchmarkCorpus({ targetTokens: 12000, scale: 0.35 });
  const stats = traces.map((trace) => summarizeTrace(trace));

  assert.equal(traces.length, 4);
  assert.ok(traces.some((trace) => trace.name.includes("minute-first-token")));
  assert.ok(traces.some((trace) => trace.name.includes("timeout-edge")));
  assert.ok(stats.every((row) => row.totalChars >= 18_000));
  assert.ok(stats.some((row) => row.firstDelayMs >= 50_000));
  assert.ok(stats.some((row) => row.maxGapMs >= 60_000));
  assert.ok(stats.some((row) => row.gapsOver30Sec >= 1));
  assert.ok(stats.some((row) => row.gapsOver60Sec >= 1));
});
