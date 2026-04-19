import {
  DEFAULT_REVEAL_TUNING,
  FAST_FIRST_REVEAL_TUNING,
  SOFT_FINISH_REVEAL_TUNING,
} from '../dist/internal.js';
import { buildStressCorpus } from './lib/trace-corpus.mjs';
import { runSimulatedTraceBenchmark } from './lib/smoothness-harness.mjs';

const PROFILE_MAP = {
  balanced: DEFAULT_REVEAL_TUNING,
  fastFirst: FAST_FIRST_REVEAL_TUNING,
  softFinish: SOFT_FINISH_REVEAL_TUNING,
};

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

function mean(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 2) {
  return Number(value.toFixed(digits));
}

async function evaluateProfile(profileName, traces) {
  const tuning = PROFILE_MAP[profileName];
  if (!tuning) {
    throw new Error(`Unknown profile: ${profileName}`);
  }

  let totalEvents = 0;
  let totalSamples = 0;
  let totalChars = 0;
  const firstVisibleLags = [];
  const completionLags = [];
  const velocityCvs = [];
  const completionSnaps = [];
  let firstVisibleBreaches = 0;
  let completionBreaches = 0;
  let velocityBreaches = 0;

  for (const trace of traces) {
    const result = await runSimulatedTraceBenchmark({ trace, tuning });
    totalEvents += trace.events.length;
    totalSamples += result.samples.length;
    totalChars += result.finalSnapshot.text.length;
    firstVisibleLags.push(result.metrics.firstVisibleLagMs);
    completionLags.push(result.metrics.completionLagMs);
    velocityCvs.push(result.metrics.velocityCv);
    completionSnaps.push(result.metrics.completionSnapFactor);

    if (result.metrics.firstVisibleLagMs > 20) {
      firstVisibleBreaches += 1;
    }
    if (result.metrics.completionLagMs > tuning.completeMaxDurationMs + 60) {
      completionBreaches += 1;
    }
    if (result.metrics.velocityCv > 0.9) {
      velocityBreaches += 1;
    }
  }

  return {
    profile: profileName,
    traces: traces.length,
    events: totalEvents,
    samples: totalSamples,
    chars: totalChars,
    firstVisibleLagMean: mean(firstVisibleLags),
    firstVisibleLagP95: percentile(firstVisibleLags, 0.95),
    completionLagMean: mean(completionLags),
    completionLagP95: percentile(completionLags, 0.95),
    velocityCvMean: mean(velocityCvs),
    velocityCvP95: percentile(velocityCvs, 0.95),
    completionSnapP95: percentile(completionSnaps, 0.95),
    firstVisibleBreaches,
    completionBreaches,
    velocityBreaches,
  };
}

async function main() {
  const traceCount = Math.max(100, Number(process.env.MASSIVE_TRACE_COUNT) || 2000);
  const profiles = String(process.env.MASSIVE_PROFILES || 'balanced,fastFirst')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const traces = buildStressCorpus({ count: traceCount });
  const rows = [];

  for (const profileName of profiles) {
    rows.push(await evaluateProfile(profileName, traces));
  }

  console.table(
    rows.map((row) => ({
      profile: row.profile,
      traces: row.traces,
      events: row.events,
      samples: row.samples,
      chars: row.chars,
      firstVisibleLagP95: round(row.firstVisibleLagP95, 1),
      completionLagP95: round(row.completionLagP95, 1),
      velocityCvP95: round(row.velocityCvP95, 3),
      completionSnapP95: round(row.completionSnapP95, 3),
      firstVisibleBreaches: row.firstVisibleBreaches,
      completionBreaches: row.completionBreaches,
      velocityBreaches: row.velocityBreaches,
    })),
  );

  console.log(
    JSON.stringify(
      {
        traceCount,
        profiles,
        rows,
      },
      null,
      2,
    ),
  );
}

await main();
