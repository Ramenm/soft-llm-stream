import { createSoftLlmStream } from "./dist/index.js";
import { getBrowserDemoTraces } from "./demo-traces.js";
import {
  createRawMetricEntries,
  createSmoothMetricEntries,
  createAutoFollowState,
  forceAutoFollow,
  resetAutoFollow,
  syncAutoFollow,
  updateAutoFollowPreference,
} from "./ui-helpers.js";

const traceSelect = document.querySelector("#trace-select");
const profileSelect = document.querySelector("#profile-select");
const loopToggle = document.querySelector("#loop-toggle");
const restartButton = document.querySelector("#restart-button");

const traceProfileTitle = document.querySelector("#trace-profile-title");
const traceProfileDescription = document.querySelector("#trace-profile-description");
const traceProfileMetrics = document.querySelector("#trace-profile-metrics");

const rawOutput = document.querySelector("#raw-output");
const smoothOutput = document.querySelector("#smooth-output");
const rawStatus = document.querySelector("#raw-status");
const smoothStatus = document.querySelector("#smooth-status");
const rawMetrics = document.querySelector("#raw-metrics");
const smoothMetrics = document.querySelector("#smooth-metrics");
const rawFollowHint = document.querySelector("#raw-follow-hint");
const smoothFollowHint = document.querySelector("#smooth-follow-hint");
const rawFollowButton = document.querySelector("#raw-follow-button");
const smoothFollowButton = document.querySelector("#smooth-follow-button");
const summaryJumpValue = document.querySelector("#summary-jump-value");
const summaryJumpNote = document.querySelector("#summary-jump-note");
const summaryFreezeValue = document.querySelector("#summary-freeze-value");
const summaryFreezeNote = document.querySelector("#summary-freeze-note");
const summaryUpdatesValue = document.querySelector("#summary-updates-value");
const summaryUpdatesNote = document.querySelector("#summary-updates-note");
const summaryDoneValue = document.querySelector("#summary-done-value");
const summaryDoneNote = document.querySelector("#summary-done-note");

const DEFAULT_TRACE_NAME = "realistic-chat-short";
const DEFAULT_REVEAL_PROFILE = "fastFirst";

const rawAutoFollow = createAutoFollowState();
const smoothAutoFollow = createAutoFollowState();
const rawRenderState = createOutputRenderState();
const smoothRenderState = createOutputRenderState();
const comparisonSummary = createComparisonSummaryState();

const wait = (delayMs) =>
  new Promise((resolve) => window.setTimeout(resolve, Math.max(0, delayMs)));

const traces = getBrowserDemoTraces();

for (const trace of traces) {
  const option = document.createElement("option");
  option.value = trace.name;
  option.textContent = `${trace.name} — ${trace.description}`;
  traceSelect.append(option);
}

function formatMs(value) {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value)} ms`;
}

function formatNumber(value, maximumFractionDigits = 0) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function formatChars(value, maximumFractionDigits = 0) {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumber(value, maximumFractionDigits)} chars`;
}

function formatRate(value) {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumber(value, 0)} chars/s`;
}

function formatRatio(value) {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumber(value, 1)}x`;
}

function createComparisonSummaryState() {
  return {
    rawMetrics: createExperienceMetrics(),
    smoothMetrics: createExperienceMetrics(),
    rawDoneMs: NaN,
    smoothDoneMs: NaN,
  };
}

function setSummaryCard(valueTarget, noteTarget, value, note) {
  valueTarget.textContent = value;
  noteTarget.textContent = note;
}

function renderComparisonSummary(summaryState) {
  const rawJump = summaryState.rawMetrics.largestJumpChars;
  const smoothJump = summaryState.smoothMetrics.largestJumpChars;
  const rawFreeze = summaryState.rawMetrics.longestFreezeMs;
  const smoothFreeze = summaryState.smoothMetrics.longestFreezeMs;
  const rawUpdates = summaryState.rawMetrics.updates;
  const smoothUpdates = summaryState.smoothMetrics.updates;

  const jumpValue =
    rawJump > 0 && smoothJump > 0
      ? smoothJump < rawJump
        ? `${formatRatio(rawJump / smoothJump)} smaller`
        : rawJump === smoothJump
          ? "same"
          : `${formatRatio(smoothJump / rawJump)} larger`
      : "watching";
  const jumpNote =
    rawJump > 0 || smoothJump > 0
      ? `raw ${formatChars(rawJump)} → smooth ${formatChars(smoothJump)}`
      : "Largest visible burst per update.";

  const freezeValue =
    rawFreeze > 0 && smoothFreeze > 0
      ? smoothFreeze < rawFreeze
        ? `${formatRatio(rawFreeze / smoothFreeze)} shorter`
        : rawFreeze === smoothFreeze
          ? "same"
          : `${formatRatio(smoothFreeze / rawFreeze)} longer`
      : "watching";
  const freezeNote =
    rawFreeze > 0 || smoothFreeze > 0
      ? `raw ${formatMs(rawFreeze)} vs smooth ${formatMs(smoothFreeze)}`
      : "Longest user-visible stall so far.";

  const updatesValue =
    rawUpdates > 0 && smoothUpdates > 0
      ? smoothUpdates > rawUpdates
        ? `${formatRatio(smoothUpdates / rawUpdates)} more`
        : rawUpdates === smoothUpdates
          ? "same"
          : `${formatRatio(rawUpdates / smoothUpdates)} fewer`
      : "watching";
  const updatesNote =
    rawUpdates > 0 || smoothUpdates > 0
      ? `raw ${formatNumber(rawUpdates)} vs smooth ${formatNumber(smoothUpdates)}`
      : "How many visible text refreshes the user gets.";

  const doneDeltaMs =
    Number.isFinite(summaryState.rawDoneMs) && Number.isFinite(summaryState.smoothDoneMs)
      ? summaryState.smoothDoneMs - summaryState.rawDoneMs
      : NaN;
  const doneValue = Number.isFinite(doneDeltaMs)
    ? doneDeltaMs === 0
      ? "0 ms"
      : `${doneDeltaMs > 0 ? "+" : "−"}${formatNumber(Math.abs(doneDeltaMs))} ms`
    : "running";
  const doneNote = Number.isFinite(doneDeltaMs)
    ? `Smooth finish relative to raw ${doneDeltaMs > 0 ? 'tail overhead' : 'tail gain'}.`
    : "Final completion timing difference.";

  setSummaryCard(summaryJumpValue, summaryJumpNote, jumpValue, jumpNote);
  setSummaryCard(summaryFreezeValue, summaryFreezeNote, freezeValue, freezeNote);
  setSummaryCard(summaryUpdatesValue, summaryUpdatesNote, updatesValue, updatesNote);
  setSummaryCard(summaryDoneValue, summaryDoneNote, doneValue, doneNote);
}

function setStatus(target, state, label = state) {
  target.textContent = label;
  target.dataset.state = state;
}

function setFollowHint(target, buttonTarget, isFollowing) {
  target.textContent = isFollowing
    ? "Auto-follow keeps the latest lines in view in both panes."
    : "Manual review mode. Scroll back to the bottom to resume live follow.";
  target.dataset.mode = isFollowing ? "auto" : "manual";
  buttonTarget.hidden = isFollowing;
}

function createOutputRenderState() {
  return {
    lastText: "",
    textNode: null,
  };
}

function writeStreamingText(target, renderState, nextText) {
  if (nextText === renderState.lastText) {
    return;
  }

  if (renderState.textNode && nextText.startsWith(renderState.lastText)) {
    const delta = nextText.slice(renderState.lastText.length);
    if (delta) {
      if (typeof renderState.textNode.appendData === "function") {
        renderState.textNode.appendData(delta);
      } else {
        renderState.textNode.data += delta;
      }
    }
    renderState.lastText = nextText;
    return;
  }

  const textNode = document.createTextNode(nextText);
  target.replaceChildren(textNode);
  renderState.textNode = textNode;
  renderState.lastText = nextText;
}

function resetRenderedText(target, renderState) {
  renderState.lastText = "";
  renderState.textNode = null;
  target.replaceChildren();
}

function renderOutput(target, renderState, state, hintTarget, followButton, text) {
  writeStreamingText(target, renderState, text);
  syncAutoFollow(state, target);
  target.dataset.following = state.enabled ? "auto" : "manual";
  setFollowHint(hintTarget, followButton, state.enabled);
}

function resetOutputPanel(target, renderState, state, hintTarget, followButton) {
  resetRenderedText(target, renderState);
  resetAutoFollow(state, target);
  target.dataset.following = "auto";
  setFollowHint(hintTarget, followButton, true);
}

function createExperienceMetrics() {
  return {
    firstVisibleAt: NaN,
    lastVisibleAt: NaN,
    updates: 0,
    lastLength: 0,
    largestJumpChars: 0,
    longestFreezeMs: 0,
  };
}

function noteVisibleUpdate(metrics, nextLength, startedAt, at = performance.now()) {
  if (nextLength <= metrics.lastLength) {
    return;
  }

  const deltaChars = nextLength - metrics.lastLength;

  if (!Number.isFinite(metrics.firstVisibleAt)) {
    metrics.firstVisibleAt = at - startedAt;
  }

  if (Number.isFinite(metrics.lastVisibleAt)) {
    metrics.longestFreezeMs = Math.max(
      metrics.longestFreezeMs,
      at - metrics.lastVisibleAt,
    );
  }

  metrics.lastVisibleAt = at;
  metrics.updates += 1;
  metrics.lastLength = nextLength;
  metrics.largestJumpChars = Math.max(metrics.largestJumpChars, deltaChars);
}

function createExperienceMetricEntries(factory, metrics, { done = "—", visibleChars = "0" } = {}) {
  return factory({
    firstText: formatMs(metrics.firstVisibleAt),
    done,
    updates: formatNumber(metrics.updates),
    visibleChars,
    largestJump: formatChars(metrics.largestJumpChars),
    longestFreeze: formatMs(metrics.longestFreezeMs),
  });
}

function getSmoothPresentationStatus(snapshot) {
  if (snapshot.status === "done") {
    return { state: "done", label: "done" };
  }

  if (snapshot.status === "error") {
    return { state: "error", label: "error" };
  }

  if (snapshot.status === "stopped") {
    return { state: "stopped", label: "stopped" };
  }

  if (snapshot.status === "connecting") {
    return { state: "waiting", label: "waiting" };
  }

  if (snapshot.status === "streaming" && snapshot.hasBacklog) {
    return { state: "revealing", label: "revealing" };
  }

  if (snapshot.status === "streaming") {
    return { state: "waiting", label: "waiting" };
  }

  return { state: snapshot.status, label: snapshot.status };
}

function renderMetrics(target, entries) {
  target.replaceChildren(
    ...entries.map(([label, value]) => {
      const wrapper = document.createElement("div");
      wrapper.className = "metric";
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      wrapper.append(dt, dd);
      return wrapper;
    }),
  );
}

function renderTraceProfile(trace) {
  const stats = trace.stats ?? summarizeTrace(trace);
  traceProfileTitle.textContent = trace.name;
  traceProfileDescription.textContent = trace.description;
  renderMetrics(traceProfileMetrics, [
    ["total chars", formatNumber(stats.totalChars)],
    ["duration", formatMs(stats.totalDurationMs)],
    ["first delay", formatMs(stats.firstDelayMs)],
    ["chunks", formatNumber(stats.chunkCount)],
    ["avg chunk", formatChars(stats.meanChunkChars, 1)],
    ["p90 chunk", formatChars(stats.p90ChunkChars, 0)],
    ["avg gap", formatMs(stats.meanGapMs)],
    ["throughput", formatRate(stats.charsPerSecond)],
  ]);
}

renderComparisonSummary(comparisonSummary);

function createTraceSource(events, runToken) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        if (runToken.cancelled) {
          return;
        }
        await wait(event.delayMs);
        if (runToken.cancelled) {
          return;
        }
        yield event.text;
      }
    },
  };
}

async function playRaw(
  target,
  renderState,
  autoFollowState,
  hintTarget,
  followButton,
  statusTarget,
  metricsTarget,
  trace,
  runToken,
) {
  const startedAt = performance.now();
  const metricsState = createExperienceMetrics();
  let text = "";

  setStatus(statusTarget, "waiting", "waiting");
  renderMetrics(
    metricsTarget,
    createExperienceMetricEntries(createRawMetricEntries, metricsState),
  );

  for (const event of trace.events) {
    if (runToken.cancelled) return;
    setStatus(statusTarget, "waiting", "waiting");
    await wait(event.delayMs);
    if (runToken.cancelled) return;
    text += event.text;
    noteVisibleUpdate(metricsState, text.length, startedAt);
    renderOutput(target, renderState, autoFollowState, hintTarget, followButton, text);
    renderMetrics(
      metricsTarget,
      createExperienceMetricEntries(createRawMetricEntries, metricsState, {
        done: "—",
        visibleChars: formatNumber(text.length),
      }),
    );
    comparisonSummary.rawMetrics = { ...metricsState };
    renderComparisonSummary(comparisonSummary);
  }

  const doneAt = performance.now() - startedAt;
  comparisonSummary.rawMetrics = { ...metricsState };
  comparisonSummary.rawDoneMs = doneAt;
  setStatus(statusTarget, "done", "done");
  renderMetrics(
    metricsTarget,
    createExperienceMetricEntries(createRawMetricEntries, metricsState, {
      done: formatMs(doneAt),
      visibleChars: formatNumber(text.length),
    }),
  );
  renderComparisonSummary(comparisonSummary);
}

let activeRun = null;

for (const [element, state, hintTarget, followButton] of [
  [rawOutput, rawAutoFollow, rawFollowHint, rawFollowButton],
  [smoothOutput, smoothAutoFollow, smoothFollowHint, smoothFollowButton],
]) {
  element.addEventListener("scroll", () => {
    updateAutoFollowPreference(state, element);
    element.dataset.following = state.enabled ? "auto" : "manual";
    setFollowHint(hintTarget, followButton, state.enabled);
  });

  followButton.addEventListener("click", () => {
    forceAutoFollow(state, element);
    element.dataset.following = "auto";
    setFollowHint(hintTarget, followButton, true);
  });
}

async function runComparison() {
  activeRun?.cancel();

  const trace = traces.find((item) => item.name === traceSelect.value) ?? traces[0];
  const revealProfile = profileSelect.value;
  renderTraceProfile(trace);
  const runToken = {
    cancelled: false,
    store: null,
    loopTimer: null,
    cancel() {
      this.cancelled = true;
      if (this.loopTimer) {
        window.clearTimeout(this.loopTimer);
        this.loopTimer = null;
      }
      void this.store?.stop?.();
    },
  };
  activeRun = runToken;

  resetOutputPanel(
    rawOutput,
    rawRenderState,
    rawAutoFollow,
    rawFollowHint,
    rawFollowButton,
  );
  resetOutputPanel(
    smoothOutput,
    smoothRenderState,
    smoothAutoFollow,
    smoothFollowHint,
    smoothFollowButton,
  );
  setStatus(rawStatus, "idle", "idle");
  setStatus(smoothStatus, "idle", "idle");
  comparisonSummary.rawMetrics = createExperienceMetrics();
  comparisonSummary.smoothMetrics = createExperienceMetrics();
  comparisonSummary.rawDoneMs = NaN;
  comparisonSummary.smoothDoneMs = NaN;
  renderComparisonSummary(comparisonSummary);

  const smoothStartedAt = performance.now();
  const smoothExperience = createExperienceMetrics();

  const store = createSoftLlmStream({
    source: createTraceSource(trace.events, runToken),
    revealProfile,
  });
  runToken.store = store;

  const unsubscribe = store.subscribe(() => {
    if (runToken.cancelled) return;
    const snapshot = store.getSnapshot();
    const status = getSmoothPresentationStatus(snapshot);
    noteVisibleUpdate(smoothExperience, snapshot.text.length, smoothStartedAt);
    renderOutput(
      smoothOutput,
      smoothRenderState,
      smoothAutoFollow,
      smoothFollowHint,
      smoothFollowButton,
      snapshot.text,
    );
    setStatus(smoothStatus, status.state, status.label);
    renderMetrics(
      smoothMetrics,
      createExperienceMetricEntries(createSmoothMetricEntries, smoothExperience, {
        done: snapshot.completedAt
          ? formatMs(snapshot.completedAt - snapshot.startedAt)
          : "—",
        visibleChars: formatNumber(snapshot.text.length),
      }),
    );
    comparisonSummary.smoothMetrics = { ...smoothExperience };
    comparisonSummary.smoothDoneMs = snapshot.completedAt
      ? snapshot.completedAt - snapshot.startedAt
      : comparisonSummary.smoothDoneMs;
    renderComparisonSummary(comparisonSummary);
  });

  renderMetrics(
    smoothMetrics,
    createExperienceMetricEntries(createSmoothMetricEntries, smoothExperience),
  );

  const rawPromise = playRaw(
    rawOutput,
    rawRenderState,
    rawAutoFollow,
    rawFollowHint,
    rawFollowButton,
    rawStatus,
    rawMetrics,
    trace,
    runToken,
  );
  const smoothPromise = store.start().catch((error) => {
    if (runToken.cancelled) return null;
    console.error(error);
    setStatus(smoothStatus, "error", "error");
    renderMetrics(
      smoothMetrics,
      createExperienceMetricEntries(createSmoothMetricEntries, smoothExperience, {
        done: "error",
        visibleChars: formatNumber(store.getSnapshot().text.length),
      }),
    );
    return null;
  });

  await Promise.allSettled([rawPromise, smoothPromise]);
  unsubscribe();

  if (activeRun === runToken && !runToken.cancelled && loopToggle.checked) {
    runToken.loopTimer = window.setTimeout(() => {
      if (activeRun === runToken && !runToken.cancelled) {
        void runComparison();
      }
    }, 1400);
  }
}

restartButton.addEventListener("click", () => {
  void runComparison();
});

traceSelect.addEventListener("change", () => {
  void runComparison();
});

profileSelect.addEventListener("change", () => {
  void runComparison();
});

loopToggle.addEventListener("change", () => {
  if (!loopToggle.checked) {
    if (activeRun?.loopTimer) {
      window.clearTimeout(activeRun.loopTimer);
      activeRun.loopTimer = null;
    }
    return;
  }

  const activeStatus = activeRun?.store?.getSnapshot?.().status;
  if (
    !activeRun ||
    activeRun.cancelled ||
    activeStatus == null ||
    activeStatus === "idle" ||
    activeStatus === "stopped" ||
    activeStatus === "done" ||
    activeStatus === "error"
  ) {
    void runComparison();
  }
});

const initialTrace =
  traces.find((trace) => trace.name === DEFAULT_TRACE_NAME) ?? traces[0];

traceSelect.value = initialTrace.name;
profileSelect.value = DEFAULT_REVEAL_PROFILE;
renderTraceProfile(initialTrace);
void runComparison();
