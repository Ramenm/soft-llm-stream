const DEFAULT_AUTO_FOLLOW_THRESHOLD_PX = 32;

function getMaxScrollTop(element) {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

export function createAutoFollowState({
  thresholdPx = DEFAULT_AUTO_FOLLOW_THRESHOLD_PX,
} = {}) {
  return {
    enabled: true,
    thresholdPx,
  };
}

export function scrollToBottom(element) {
  element.scrollTop = getMaxScrollTop(element);
  return element.scrollTop;
}

export function forceAutoFollow(state, element) {
  state.enabled = true;
  scrollToBottom(element);
  return state.enabled;
}

export function updateAutoFollowPreference(state, element) {
  const maxScrollTop = getMaxScrollTop(element);
  state.enabled = maxScrollTop - element.scrollTop <= state.thresholdPx;
  return state.enabled;
}

export function syncAutoFollow(state, element) {
  if (state.enabled) {
    scrollToBottom(element);
  }

  return state.enabled;
}

export function resetAutoFollow(state, element) {
  state.enabled = true;
  scrollToBottom(element);
  return state.enabled;
}

export function createRawMetricEntries({
  firstText = "—",
  done = "—",
  updates = "0",
  visibleChars = "0",
  largestJump = "0 chars",
  longestFreeze = "0 ms",
} = {}) {
  return [
    ["first text", firstText],
    ["done", done],
    ["visible updates", updates],
    ["visible chars", visibleChars],
    ["largest jump", largestJump],
    ["longest freeze", longestFreeze],
  ];
}

export function createSmoothMetricEntries({
  firstText = "—",
  done = "—",
  updates = "0",
  visibleChars = "0",
  largestJump = "0 chars",
  longestFreeze = "0 ms",
} = {}) {
  return [
    ["first text", firstText],
    ["done", done],
    ["visible updates", updates],
    ["visible chars", visibleChars],
    ["largest jump", largestJump],
    ["longest freeze", longestFreeze],
  ];
}
