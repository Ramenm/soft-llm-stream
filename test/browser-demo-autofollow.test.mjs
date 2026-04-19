import test from "node:test";
import assert from "node:assert/strict";

import {
  createRawMetricEntries,
  createSmoothMetricEntries,
  createAutoFollowState,
  forceAutoFollow,
  scrollToBottom,
  syncAutoFollow,
  updateAutoFollowPreference,
} from "../ui-helpers.js";

function createMockElement({ scrollTop = 0, clientHeight = 200, scrollHeight = 800 } = {}) {
  return {
    scrollTop,
    clientHeight,
    scrollHeight,
  };
}

test("auto-follow keeps a stream pinned to the latest text when the viewer stayed near the bottom", () => {
  const state = createAutoFollowState();
  const element = createMockElement({ scrollTop: 590, clientHeight: 200, scrollHeight: 800 });

  updateAutoFollowPreference(state, element);
  element.scrollHeight = 980;
  syncAutoFollow(state, element);

  assert.equal(state.enabled, true);
  assert.equal(element.scrollTop, 780);
});

test("auto-follow stops forcing scroll when the viewer intentionally scrolled upward", () => {
  const state = createAutoFollowState();
  const element = createMockElement({ scrollTop: 120, clientHeight: 200, scrollHeight: 800 });

  updateAutoFollowPreference(state, element);
  element.scrollHeight = 980;
  syncAutoFollow(state, element);

  assert.equal(state.enabled, false);
  assert.equal(element.scrollTop, 120);
});

test("scrollToBottom snaps a panel to its latest visible line", () => {
  const element = createMockElement({ scrollTop: 0, clientHeight: 240, scrollHeight: 860 });

  scrollToBottom(element);

  assert.equal(element.scrollTop, 620);
});

test("forceAutoFollow re-enables auto-follow and snaps back to the newest text", () => {
  const state = createAutoFollowState();
  state.enabled = false;
  const element = createMockElement({ scrollTop: 160, clientHeight: 220, scrollHeight: 920 });

  forceAutoFollow(state, element);

  assert.equal(state.enabled, true);
  assert.equal(element.scrollTop, 700);
});

test("raw and smoothed panes expose the same metric slots so the layout stays aligned", () => {
  const rawEntries = createRawMetricEntries({
    firstText: "120 ms",
    done: "880 ms",
    updates: "5",
    visibleChars: "420",
    largestJump: "56 chars",
    longestFreeze: "640 ms",
  });
  const smoothEntries = createSmoothMetricEntries({
    firstText: "110 ms",
    done: "910 ms",
    updates: "14",
    visibleChars: "420",
    largestJump: "18 chars",
    longestFreeze: "210 ms",
  });

  assert.equal(rawEntries.length, smoothEntries.length);
  assert.deepEqual(
    rawEntries.map(([label]) => label),
    smoothEntries.map(([label]) => label),
  );
  assert.equal(rawEntries[0][0], "first text");
  assert.equal(rawEntries[2][0], "visible updates");
  assert.equal(rawEntries[4][0], "largest jump");
  assert.equal(rawEntries[5][0], "longest freeze");
});
