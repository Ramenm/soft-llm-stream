import {
  DEFAULT_REVEAL_TUNING,
  FAST_FIRST_REVEAL_TUNING,
  SOFT_FINISH_REVEAL_TUNING,
} from '../dist/internal.js';
import { buildStressCorpus } from './lib/trace-corpus.mjs';
import { runRealtimeTraceBenchmark } from './lib/smoothness-harness.mjs';

const PROFILE_MAP = {
  balanced: DEFAULT_REVEAL_TUNING,
  fastFirst: FAST_FIRST_REVEAL_TUNING,
  softFinish: SOFT_FINISH_REVEAL_TUNING,
};

function mean(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

function scaleTraceDelays(trace, delayScale) {
  return {
    ...trace,
    events: trace.events.map((event) => ({
      ...event,
      delayMs: Math.max(0, Math.round((Number(event.delayMs) || 0) * delayScale)),
    })),
  };
}

async function evaluateProfile(profileName, traces, frameMs) {
  const tuning = PROFILE_MAP[profileName];
  if (!tuning) {
    throw new Error(`Unknown profile: ${profileName}`);
  }

  const rows = [];

  for (const trace of traces) {
    rows.push(
      await runRealtimeTraceBenchmark({
        trace,
        frameMs,
        tuning,
      }),
    );
  }

  return {
    profile: profileName,
    traces: traces.length,
    chars: rows.reduce((sum, row) => sum + row.finalSnapshot.text.length, 0),
    notificationsPer1kCharsMean: mean(
      rows.map((row) => row.runtimeCost.notificationsPer1kChars),
    ),
    notificationsPer1kCharsP95: percentile(
      rows.map((row) => row.runtimeCost.notificationsPer1kChars),
      0.95,
    ),
    visibleUpdatesPer1kCharsMean: mean(
      rows.map((row) => row.runtimeCost.visibleUpdatesPer1kChars),
    ),
    visibleUpdatesPer1kCharsP95: percentile(
      rows.map((row) => row.runtimeCost.visibleUpdatesPer1kChars),
      0.95,
    ),
    completionLagP95: percentile(
      rows.map((row) => row.metrics.completionLagMs),
      0.95,
    ),
    firstVisibleLagP95: percentile(
      rows.map((row) => row.metrics.firstVisibleLagMs),
      0.95,
    ),
  };
}

async function main() {
  const traceCount = Math.max(3, Number(process.env.CLIENT_TRACE_COUNT) || 4);
  const delayScale = Math.max(0.05, Number(process.env.CLIENT_DELAY_SCALE) || 0.08);
  const frameMs = Math.max(4, Number(process.env.CLIENT_FRAME_MS) || 1000 / 60);
  const profiles = String(process.env.CLIENT_PROFILES || 'balanced,fastFirst')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const traces = buildStressCorpus({ count: traceCount }).map((trace) =>
    scaleTraceDelays(trace, delayScale),
  );
  const rows = [];

  for (const profileName of profiles) {
    rows.push(await evaluateProfile(profileName, traces, frameMs));
  }

  console.table(
    rows.map((row) => ({
      profile: row.profile,
      traces: row.traces,
      chars: row.chars,
      notificationsPer1kCharsMean: round(row.notificationsPer1kCharsMean),
      notificationsPer1kCharsP95: round(row.notificationsPer1kCharsP95),
      visibleUpdatesPer1kCharsMean: round(row.visibleUpdatesPer1kCharsMean),
      visibleUpdatesPer1kCharsP95: round(row.visibleUpdatesPer1kCharsP95),
      firstVisibleLagP95: round(row.firstVisibleLagP95, 1),
      completionLagP95: round(row.completionLagP95, 1),
    })),
  );

  console.log(
    JSON.stringify(
      {
        traceCount,
        delayScale,
        frameMs,
        profiles,
        rows,
      },
      null,
      2,
    ),
  );
}

await main();
