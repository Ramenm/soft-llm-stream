import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { getBrowserDemoTraces } from "../demo-traces.js";

const MAIN_JS = fs.readFileSync(new URL("../main.js", import.meta.url), "utf8");

function assertBatchTrace(trace, { expectedEvents, minDelayMs, maxDelayMs, descriptionPattern }) {
  assert.ok(trace, "expected trace to be present");
  assert.equal(trace.events.length, expectedEvents);

  for (const event of trace.events) {
    assert.ok(event.delayMs >= minDelayMs, `delay ${event.delayMs}ms should be at least ${minDelayMs}ms`);
    assert.ok(event.delayMs <= maxDelayMs, `delay ${event.delayMs}ms should be at most ${maxDelayMs}ms`);
    assert.ok(event.text.length > 40, "each batch should look like a visible chunk, not a token drip");
  }

  assert.match(trace.description, descriptionPattern);
}

test("browser demo includes a realistic chat trace with five long batches", () => {
  const traces = getBrowserDemoTraces();
  const realisticTrace = traces.find((trace) => trace.name === "realistic-chat");

  assertBatchTrace(realisticTrace, {
    expectedEvents: 5,
    minDelayMs: 5000,
    maxDelayMs: 15000,
    descriptionPattern: /5-15 second pauses/i,
  });
});

test("browser demo includes a client-facing showcase trace for recordings", () => {
  const traces = getBrowserDemoTraces();
  const showcaseTrace = traces.find((trace) => trace.name === "showcase-chat");

  assertBatchTrace(showcaseTrace, {
    expectedEvents: 10,
    minDelayMs: 600,
    maxDelayMs: 3500,
    descriptionPattern: /client-facing product demo/i,
  });
  assert.ok(
    showcaseTrace.stats.totalChars > 1500,
    "showcase-chat should be long enough to exercise the recording scroll area",
  );
});

test("browser demo defaults to the client-facing showcase trace", () => {
  assert.match(MAIN_JS, /DEFAULT_TRACE_NAME = "showcase-chat"/);
});

test("browser demo exposes additional realistic trace variants for shorter, slower, and tool-gap scenarios", () => {
  const traces = getBrowserDemoTraces();

  assertBatchTrace(
    traces.find((trace) => trace.name === "realistic-chat-short"),
    {
      expectedEvents: 5,
      minDelayMs: 3000,
      maxDelayMs: 7000,
      descriptionPattern: /3-7 second pauses/i,
    },
  );

  assertBatchTrace(
    traces.find((trace) => trace.name === "realistic-chat-very-slow"),
    {
      expectedEvents: 5,
      minDelayMs: 10000,
      maxDelayMs: 15000,
      descriptionPattern: /10-15 second pauses/i,
    },
  );

  const toolCallGapTrace = traces.find((trace) => trace.name === "tool-call-gap");
  assertBatchTrace(toolCallGapTrace, {
    expectedEvents: 5,
    minDelayMs: 1200,
    maxDelayMs: 15000,
    descriptionPattern: /tool call/i,
  });
  assert.ok(
    toolCallGapTrace.events.some((event) => event.delayMs >= 12000),
    "tool-call-gap should include one obviously long stall",
  );
});
