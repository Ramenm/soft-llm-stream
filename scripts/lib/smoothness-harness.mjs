import { performance } from "node:perf_hooks";

import { createSoftLlmStream } from "../../dist/index.js";
import { simulateTrace } from "../../dist/internal.js";

export const DEFAULT_FRAME_MS = 1000 / 60;
const ACTIVE_FLOW_MODES = new Set(["steady", "catchup"]);

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, ratio) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * Math.max(0, Math.min(1, ratio));
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);
  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }
  const remainder = index - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * remainder;
}

function createTraceSource(events) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const event of events) {
        const delayMs = Math.max(0, Number(event.delayMs) || 0);
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        yield String(event.text ?? "");
      }
    },
  };
}

function installBrowserShims(frameMs) {
  const previous = {
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    window: globalThis.window,
  };

  globalThis.document = {
    visibilityState: "visible",
    documentElement: { lang: "en" },
    addEventListener() {},
    removeEventListener() {},
  };

  globalThis.window = {
    matchMedia() {
      return { matches: false };
    },
  };

  globalThis.requestAnimationFrame = (callback) =>
    setTimeout(() => callback(performance.now()), frameMs);

  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);

  return () => {
    if (previous.document === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previous.document;
    }

    if (previous.window === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previous.window;
    }

    if (previous.requestAnimationFrame === undefined) {
      delete globalThis.requestAnimationFrame;
    } else {
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    }

    if (previous.cancelAnimationFrame === undefined) {
      delete globalThis.cancelAnimationFrame;
    } else {
      globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    }
  };
}

let browserShimLock = Promise.resolve();

async function withBrowserShims(frameMs, run) {
  let releaseLock = () => {};
  const previousLock = browserShimLock;
  browserShimLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  await previousLock;
  const restoreBrowserShims = installBrowserShims(frameMs);

  try {
    return await run();
  } finally {
    restoreBrowserShims();
    releaseLock();
  }
}

export function computeSmoothnessMetrics({ samples }) {
  const intervalSamples = [];
  let avoidableStallMs = 0;
  let maxAvoidableStallMs = 0;
  let currentAvoidableStallMs = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const deltaTimeMs = current.timestampMs - previous.timestampMs;

    if (!Number.isFinite(deltaTimeMs) || deltaTimeMs < 1) {
      continue;
    }

    const deltaVisibleChars = current.visibleChars - previous.visibleChars;
    const velocity = deltaVisibleChars / deltaTimeMs;
    intervalSamples.push({
      velocity,
      deltaTimeMs,
      previous,
      current,
    });

    if (deltaVisibleChars <= 0 && previous.hiddenChars > 0) {
      avoidableStallMs += deltaTimeMs;
      currentAvoidableStallMs += deltaTimeMs;
      maxAvoidableStallMs = Math.max(
        maxAvoidableStallMs,
        currentAvoidableStallMs,
      );
    } else {
      currentAvoidableStallMs = 0;
    }
  }

  const finalFullChars =
    samples.length > 0 ? samples[samples.length - 1].fullChars : 0;
  const firstAvailableMs =
    samples.find((sample) => sample.fullChars > 0)?.timestampMs ?? 0;
  const visibleCompletionMs =
    samples.find((sample) => sample.visibleChars >= finalFullChars)?.timestampMs ?? 0;
  const fullCompletionMs =
    samples.find((sample) => sample.fullChars >= finalFullChars)?.timestampMs ?? 0;
  const warmupSkipCount = Math.min(
    4,
    Math.max(0, Math.floor(intervalSamples.length * 0.15)),
  );
  const analysisIntervals = intervalSamples.slice(warmupSkipCount);
  const velocitySamples = analysisIntervals.map(({ velocity }) => velocity);
  const jerkSamples = [];

  for (let index = 1; index < velocitySamples.length; index += 1) {
    jerkSamples.push(
      Math.abs(velocitySamples[index] - velocitySamples[index - 1]),
    );
  }

  const completionIntervals = analysisIntervals.filter(
    ({ previous }) => previous.mode === "complete" && previous.hiddenChars > 0,
  );
  const steadyStateIntervals = analysisIntervals.filter(
    ({ previous, velocity }) =>
      previous.mode !== "complete" && previous.hiddenChars > 0 && velocity > 0,
  );
  const steadyStateVelocity = median(
    steadyStateIntervals.map(({ velocity }) => velocity).filter((velocity) => velocity > 0),
  );
  const peakCompletionVelocity =
    completionIntervals.length > 0
      ? Math.max(...completionIntervals.map(({ velocity }) => velocity))
      : steadyStateIntervals.length > 0
        ? Math.max(...steadyStateIntervals.map(({ velocity }) => velocity))
        : 0;
  const timeToFirstVisibleMs =
    samples.find((sample) => sample.visibleChars > 0)?.timestampMs ?? 0;
  const firstVisibleLagMs = Math.max(0, timeToFirstVisibleMs - firstAvailableMs);

  const bandSamples = samples
    .slice(Math.min(samples.length, warmupSkipCount + 1))
    .filter(
      (sample) =>
        sample.hiddenChars > 0 &&
        sample.maxHorizonMs > 0 &&
        ACTIVE_FLOW_MODES.has(sample.mode),
    );
  const bandCoverage =
    bandSamples.length > 0
      ? bandSamples.filter(
          (sample) =>
            sample.hiddenBacklogHorizonMs >= sample.reserveHorizonMs &&
            sample.hiddenBacklogHorizonMs <= sample.maxHorizonMs,
        ).length / bandSamples.length
      : 1;

  const meanVelocity = mean(velocitySamples);
  const velocityStdDev = standardDeviation(velocitySamples);
  const velocityCv =
    meanVelocity > 0 ? velocityStdDev / meanVelocity : 0;

  return {
    sampleCount: samples.length,
    velocitySampleCount: velocitySamples.length,
    meanVelocity,
    velocityStdDev,
    velocityCv,
    meanJerk: mean(jerkSamples),
    maxJerk: jerkSamples.length > 0 ? Math.max(...jerkSamples) : 0,
    avoidableStallMs,
    maxAvoidableStallMs,
    avoidableStallP95Ms: percentile(
      intervalSamples
        .filter(({ previous, velocity }) => previous.hiddenChars > 0 && velocity <= 0)
        .map(({ deltaTimeMs }) => deltaTimeMs),
      0.95,
    ),
    completionSnapFactor:
      steadyStateVelocity > 0
        ? peakCompletionVelocity / steadyStateVelocity
        : 1,
    completionLagMs: Math.max(0, visibleCompletionMs - fullCompletionMs),
    completionLagRatio:
      fullCompletionMs > firstAvailableMs
        ? Math.max(0, visibleCompletionMs - fullCompletionMs) /
          Math.max(DEFAULT_FRAME_MS, fullCompletionMs - firstAvailableMs)
        : 0,
    timeToFirstVisibleMs,
    firstVisibleLagMs,
    backlogHorizonBandCoverage: bandCoverage,
  };
}


function getLastTimelineEntryBefore(timeline, timestampMs) {
  let last = timeline[0] ?? { timestampMs: 0, visibleChars: 0, fullChars: 0 };
  for (const entry of timeline) {
    if (entry.timestampMs >= timestampMs) {
      break;
    }
    last = entry;
  }
  return last;
}

function getLastTimelineEntryAtOrBefore(timeline, timestampMs) {
  let last = timeline[0] ?? { timestampMs: 0, visibleChars: 0, fullChars: 0 };
  for (const entry of timeline) {
    if (entry.timestampMs > timestampMs) {
      break;
    }
    last = entry;
  }
  return last;
}

function getWindowShare({
  visibleTimeline,
  visibleBefore,
  arrivalTimestampMs,
  nextFullTimestampMs,
  batchChars,
  windowMs,
}) {
  if (nextFullTimestampMs < arrivalTimestampMs + windowMs) {
    return null;
  }

  const visibleAtWindow = getLastTimelineEntryAtOrBefore(
    visibleTimeline,
    arrivalTimestampMs + windowMs,
  );

  return batchChars > 0
    ? Math.max(0, visibleAtWindow.visibleChars - visibleBefore.visibleChars) / batchChars
    : 0;
}

export function computeGapBurstMetrics({
  fullTextTimeline,
  visibleTimeline,
  gapThresholdMs = 180,
  minBatchChars = 256,
}) {
  const cases = [];

  for (let index = 1; index < fullTextTimeline.length; index += 1) {
    const previousFull = fullTextTimeline[index - 1];
    const currentFull = fullTextTimeline[index];
    const batchChars = Math.max(0, currentFull.fullChars - previousFull.fullChars);
    const gapMs = Math.max(0, currentFull.timestampMs - previousFull.timestampMs);

    if (batchChars < minBatchChars || gapMs < gapThresholdMs) {
      continue;
    }

    const nextFullTimestampMs =
      fullTextTimeline[index + 1]?.timestampMs ?? Number.POSITIVE_INFINITY;
    const visibleBefore = getLastTimelineEntryBefore(
      visibleTimeline,
      currentFull.timestampMs,
    );
    const hiddenBeforeArrival = Math.max(
      0,
      previousFull.fullChars - visibleBefore.visibleChars,
    );

    if (hiddenBeforeArrival > 1) {
      continue;
    }

    const updatesAfterArrival = visibleTimeline.filter(
      (entry) =>
        entry.timestampMs >= currentFull.timestampMs &&
        entry.timestampMs < nextFullTimestampMs &&
        entry.visibleChars > visibleBefore.visibleChars,
    );

    const firstUpdate = updatesAfterArrival[0] ?? visibleBefore;
    const secondUpdate = updatesAfterArrival[1] ?? firstUpdate;
    const thirdUpdate = updatesAfterArrival[2] ?? secondUpdate;

    let updatesBeforeDrain = 0;
    for (const entry of updatesAfterArrival) {
      updatesBeforeDrain += 1;
      if (entry.visibleChars >= currentFull.fullChars) {
        break;
      }
    }

    cases.push({
      gapMs,
      batchChars,
      firstJumpChars: Math.max(0, firstUpdate.visibleChars - visibleBefore.visibleChars),
      firstJumpShare:
        batchChars > 0
          ? Math.max(0, firstUpdate.visibleChars - visibleBefore.visibleChars) / batchChars
          : 0,
      firstTwoJumpShare:
        batchChars > 0
          ? Math.max(0, secondUpdate.visibleChars - visibleBefore.visibleChars) / batchChars
          : 0,
      firstThreeJumpShare:
        batchChars > 0
          ? Math.max(0, thirdUpdate.visibleChars - visibleBefore.visibleChars) / batchChars
          : 0,
      shareAfter250Ms: getWindowShare({
        visibleTimeline,
        visibleBefore,
        arrivalTimestampMs: currentFull.timestampMs,
        nextFullTimestampMs,
        batchChars,
        windowMs: 250,
      }),
      shareAfter750Ms: getWindowShare({
        visibleTimeline,
        visibleBefore,
        arrivalTimestampMs: currentFull.timestampMs,
        nextFullTimestampMs,
        batchChars,
        windowMs: 750,
      }),
      updatesBeforeDrain,
    });
  }

  const shareAfter250MsValues = cases
    .map((row) => row.shareAfter250Ms)
    .filter((value) => value != null);
  const shareAfter750MsValues = cases
    .map((row) => row.shareAfter750Ms)
    .filter((value) => value != null);

  return {
    delayedLargeBatchCount: cases.length,
    cases,
    maxFirstJumpChars:
      cases.length > 0 ? Math.max(...cases.map((row) => row.firstJumpChars)) : 0,
    maxFirstJumpShare:
      cases.length > 0 ? Math.max(...cases.map((row) => row.firstJumpShare)) : 0,
    maxFirstTwoJumpShare:
      cases.length > 0 ? Math.max(...cases.map((row) => row.firstTwoJumpShare)) : 0,
    maxFirstThreeJumpShare:
      cases.length > 0 ? Math.max(...cases.map((row) => row.firstThreeJumpShare)) : 0,
    shareAfter250MsCaseCount: shareAfter250MsValues.length,
    maxShareAfter250Ms:
      shareAfter250MsValues.length > 0 ? Math.max(...shareAfter250MsValues) : 0,
    shareAfter750MsCaseCount: shareAfter750MsValues.length,
    maxShareAfter750Ms:
      shareAfter750MsValues.length > 0 ? Math.max(...shareAfter750MsValues) : 0,
    minShareAfter750Ms:
      shareAfter750MsValues.length > 0 ? Math.min(...shareAfter750MsValues) : 0,
    medianShareAfter750Ms:
      shareAfter750MsValues.length > 0 ? median(shareAfter750MsValues) : 0,
    minUpdatesBeforeDrain:
      cases.length > 0 ? Math.min(...cases.map((row) => row.updatesBeforeDrain)) : 0,
    medianUpdatesBeforeDrain:
      cases.length > 0 ? median(cases.map((row) => row.updatesBeforeDrain)) : 0,
  };
}

export async function runRealtimeTraceBenchmark({
  trace,
  frameMs = DEFAULT_FRAME_MS,
  locale = "en",
  tuning,
}) {
  return withBrowserShims(frameMs, async () => {
    const benchmarkStartedAt = performance.now();
    const source = createTraceSource(trace.events ?? []);
    const store = createSoftLlmStream({
      source,
      locale,
      debug: tuning ? { tuning } : undefined,
    });
    const samples = [];
    let notificationCount = 0;
    let visibleUpdateCount = 0;
    let fullTextUpdateCount = 0;
    let previousText = store.getSnapshot().text;
    let previousFullText = store.getSnapshot().fullText;
    const visibleTimeline = [{ timestampMs: 0, visibleChars: previousText.length }];
    const fullTextTimeline = [{ timestampMs: 0, fullChars: previousFullText.length }];

    const unsubscribeStore = store.subscribe(() => {
      notificationCount += 1;
      const snapshot = store.getSnapshot();
      const timestampMs = performance.now() - benchmarkStartedAt;

      if (snapshot.text !== previousText) {
        visibleUpdateCount += 1;
        previousText = snapshot.text;
        visibleTimeline.push({
          timestampMs,
          visibleChars: snapshot.text.length,
        });
      }

      if (snapshot.fullText !== previousFullText) {
        fullTextUpdateCount += 1;
        previousFullText = snapshot.fullText;
        fullTextTimeline.push({
          timestampMs,
          fullChars: snapshot.fullText.length,
        });
      }
    });

    const capture = () => {
      const snapshot = store.getSnapshot();
      const debugState = store.getDebugState();
      samples.push({
        timestampMs: performance.now() - benchmarkStartedAt,
        visibleChars: snapshot.text.length,
        fullChars: snapshot.fullText.length,
        hiddenChars: snapshot.fullText.length - snapshot.text.length,
        hiddenBacklogHorizonMs: debugState.hiddenBacklogHorizonMs,
        reserveHorizonMs: debugState.reserveHorizonMs,
        targetHorizonMs: debugState.targetHorizonMs,
        maxHorizonMs: debugState.maxHorizonMs,
        visibleRateCharsPerMs: debugState.visibleRateCharsPerMs,
        mode: debugState.mode,
        status: snapshot.status,
      });
    };

    capture();
    const sampler = setInterval(capture, frameMs);

    try {
      const finalSnapshot = await store.start();
      capture();

      return {
        traceName: trace.name ?? "unnamed-trace",
        trace,
        samples,
        metrics: computeSmoothnessMetrics({ samples }),
        gapBurstMetrics: computeGapBurstMetrics({
          fullTextTimeline,
          visibleTimeline,
        }),
        finalSnapshot,
        runtimeCost: {
          notificationCount,
          visibleUpdateCount,
          fullTextUpdateCount,
          notificationsPer1kChars:
            finalSnapshot.text.length > 0
              ? (notificationCount / finalSnapshot.text.length) * 1000
              : 0,
          visibleUpdatesPer1kChars:
            finalSnapshot.text.length > 0
              ? (visibleUpdateCount / finalSnapshot.text.length) * 1000
              : 0,
        },
      };
    } finally {
      clearInterval(sampler);
      unsubscribeStore();
    }
  });
}

export async function runSimulatedTraceBenchmark({
  trace,
  frameMs = DEFAULT_FRAME_MS,
  locale = "en",
  tuning,
}) {
  const result = simulateTrace({
    trace,
    frameMs,
    locale,
    tuning,
  });

  return {
    traceName: trace.name ?? "unnamed-trace",
    trace,
    samples: result.samples,
    metrics: computeSmoothnessMetrics({ samples: result.samples }),
    gapBurstMetrics: computeGapBurstMetrics({
      fullTextTimeline: result.fullTextTimeline,
      visibleTimeline: result.visibleTimeline,
    }),
    finalSnapshot: {
      status: "done",
      text: result.finalText,
      fullText: result.trace.events.map((event) => event.text).join(""),
    },
  };
}
