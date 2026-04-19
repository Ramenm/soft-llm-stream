import test from "node:test";
import assert from "node:assert/strict";

import {
  createPresetTrace,
  createRandomTrace,
  replayTraceEvents,
  summarizeTrace,
} from "../scripts/lib/random-trace.mjs";

test("createRandomTrace is deterministic for the same seed", () => {
  const left = createRandomTrace({ seed: 123, text: "abcdefg" });
  const right = createRandomTrace({ seed: 123, text: "abcdefg" });

  assert.deepEqual(left, right);
});

test("replayTraceEvents reconstructs the original text", async () => {
  const trace = createRandomTrace({ seed: 7, text: "пример текста" });
  let text = "";

  for await (const chunk of replayTraceEvents(trace.events)) {
    text += chunk;
  }

  assert.equal(text, trace.text);
});

test("createRandomTrace can model a delayed first chunk", () => {
  const trace = createRandomTrace({
    seed: 9,
    text: "abcdefghi",
    firstDelayMs: 240,
    minChunkSize: 2,
    maxChunkSize: 3,
  });

  assert.equal(trace.events[0].delayMs, 240);
});

test("createRandomTrace can inject minute-scale stall spikes", () => {
  const trace = createRandomTrace({
    seed: 15,
    text: "z".repeat(1200),
    firstDelayMs: 0,
    minDelayMs: 0,
    maxDelayMs: 0,
    minChunkSize: 24,
    maxChunkSize: 24,
    stallChance: 0.5,
    stallMinMs: 60_000,
    stallMaxMs: 90_000,
  });
  const stats = summarizeTrace(trace);

  assert.ok(stats.maxGapMs >= 60_000);
  assert.ok(stats.gapsOver60Sec >= 1);
});

test("summarizeTrace returns stable chunk and gap stats for llm-like presets", () => {
  const trace = createPresetTrace({
    preset: "llm-bursty",
    seed: 42,
    text: "A more realistic streaming trace should arrive in medium chunks.",
  });
  const stats = summarizeTrace(trace);

  assert.equal(stats.chunkCount, trace.events.length);
  assert.equal(
    stats.totalChars,
    trace.events.reduce((total, event) => total + Array.from(event.text).length, 0),
  );
  assert.ok(stats.meanChunkChars > 0);
  assert.ok(stats.p90ChunkChars >= stats.meanChunkChars);
  assert.ok(stats.gapsOver5Sec >= 0);
  assert.ok(stats.durationMinutes >= 0);
  assert.ok(stats.charsPerSecond > 0);
});

test("createRandomTrace can ramp chunk sizes upward across a long answer", () => {
  const trace = createRandomTrace({
    seed: 77,
    text: "x".repeat(160),
    minDelayMs: 0,
    maxDelayMs: 0,
    minChunkSize: 4,
    minChunkSizeEnd: 18,
    maxChunkSize: 4,
    maxChunkSizeEnd: 18,
  });
  const sizes = trace.events.map((event) => Array.from(event.text).length);

  assert.ok(sizes.length >= 6);
  assert.ok(sizes[0] < sizes[Math.floor(sizes.length * 0.75)]);
});

test("createRandomTrace can ramp chunk sizes downward across a long answer", () => {
  const trace = createRandomTrace({
    seed: 91,
    text: "y".repeat(160),
    minDelayMs: 0,
    maxDelayMs: 0,
    minChunkSize: 16,
    minChunkSizeEnd: 5,
    maxChunkSize: 16,
    maxChunkSizeEnd: 5,
  });
  const sizes = trace.events.map((event) => Array.from(event.text).length);

  assert.ok(sizes.length >= 6);
  assert.ok(sizes[0] > sizes[Math.floor(sizes.length * 0.75)]);
});
