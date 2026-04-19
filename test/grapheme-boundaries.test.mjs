import test from "node:test";
import assert from "node:assert/strict";

import {
  chooseSliceLength,
  findGraphemeBoundary,
} from "../dist/internal.js";
import { createRandomTrace } from "../scripts/lib/random-trace.mjs";

test("findGraphemeBoundary keeps emoji modifier clusters atomic", () => {
  const text = "👍🏽 done";

  assert.equal(findGraphemeBoundary(text, 1, "en"), "👍🏽".length);
  assert.equal(findGraphemeBoundary(text, 2, "en"), "👍🏽".length);
});





test("findGraphemeBoundary handles long suffixes without walking the entire tail", () => {
  const text = `👍🏽${"a".repeat(200000)}`;

  assert.equal(findGraphemeBoundary(text, 1, "en"), "👍🏽".length);
});

test("findGraphemeBoundary keeps combining marks atomic", () => {
  const text = "e\u0301lan";

  assert.equal(findGraphemeBoundary(text, 1, "en"), "e\u0301".length);
});

test("findGraphemeBoundary keeps variation selector clusters atomic", () => {
  const text = "✈️ trip";

  assert.equal(findGraphemeBoundary(text, 1, "en"), "✈️".length);
});

test("chooseSliceLength can reveal a whole grapheme when the first cluster is wider than the raw budget", () => {
  const family = "👨‍👩‍👧‍👦";
  const remaining = `${family} family`;
  const sliceLength = chooseSliceLength(remaining, 1, {
    locale: "en",
    insideCodeFence: false,
    maxChars: 1,
    maxOvershootChars: 0,
  });

  assert.equal(sliceLength, family.length);
});

test("createRandomTrace preserves grapheme-rich source text", () => {
  const trace = createRandomTrace({
    seed: 42,
    text: "👍🏽🙂👨‍👩‍👧‍👦 mixed text",
    minChunkSize: 1,
    maxChunkSize: 2,
  });

  assert.equal(
    trace.events.map((event) => event.text).join(""),
    trace.text,
  );
  assert.ok(
    trace.events.every((event) => event.text.length > 0),
    "expected every chunk to contain at least one visible segment",
  );
});
