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

function fail(message, context) {
  const error = new Error(message);
  error.context = context;
  throw error;
}

function assertMonotonicSamples(traceName, samples) {
  let previousVisible = 0;
  let previousFull = 0;

  for (const sample of samples) {
    if (sample.visibleChars < previousVisible) {
      fail('visibleChars regressed', { traceName, sample, previousVisible });
    }
    if (sample.fullChars < previousFull) {
      fail('fullChars regressed', { traceName, sample, previousFull });
    }
    if (sample.visibleChars > sample.fullChars) {
      fail('visibleChars exceeded fullChars', { traceName, sample });
    }
    if (!Number.isFinite(sample.timestampMs)) {
      fail('timestampMs is not finite', { traceName, sample });
    }
    previousVisible = sample.visibleChars;
    previousFull = sample.fullChars;
  }
}

async function main() {
  const count = Math.max(1, Number(process.env.FUZZ_TRACE_COUNT) || 5000);
  const profiles = String(process.env.FUZZ_PROFILES || 'balanced,fastFirst,softFinish')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const traces = buildStressCorpus({ count });
  const summary = [];

  for (const profileName of profiles) {
    const tuning = PROFILE_MAP[profileName];
    if (!tuning) {
      fail('unknown profile', { profileName });
    }

    let totalEvents = 0;
    let totalSamples = 0;
    let worstVelocityCv = 0;
    let worstCompletionLagMs = 0;
    let worstFirstVisibleLagMs = 0;
    let completionLagOverSoftWindowCount = 0;
    let worstTraceName = '';

    for (const trace of traces) {
      const result = await runSimulatedTraceBenchmark({ trace, tuning });
      const expectedText = trace.events.map((event) => event.text).join('');
      totalEvents += trace.events.length;
      totalSamples += result.samples.length;
      assertMonotonicSamples(trace.name, result.samples);

      if (result.finalSnapshot.text !== expectedText) {
        fail('final visible text mismatch', {
          profileName,
          traceName: trace.name,
          expectedLength: expectedText.length,
          actualLength: result.finalSnapshot.text.length,
        });
      }

      if (result.metrics.firstVisibleLagMs > 17.5) {
        fail('first visible lag exceeded one frame budget', {
          profileName,
          traceName: trace.name,
          firstVisibleLagMs: result.metrics.firstVisibleLagMs,
        });
      }

      if (result.metrics.velocityCv > worstVelocityCv) {
        worstVelocityCv = result.metrics.velocityCv;
        worstTraceName = trace.name;
      }
      if (result.metrics.completionLagMs > tuning.completeMaxDurationMs + 34) {
        completionLagOverSoftWindowCount += 1;
      }
      worstCompletionLagMs = Math.max(worstCompletionLagMs, result.metrics.completionLagMs);
      worstFirstVisibleLagMs = Math.max(
        worstFirstVisibleLagMs,
        result.metrics.firstVisibleLagMs,
      );
    }

    summary.push({
      profile: profileName,
      traces: traces.length,
      events: totalEvents,
      samples: totalSamples,
      worstVelocityCv: Number(worstVelocityCv.toFixed(3)),
      worstCompletionLagMs: Number(worstCompletionLagMs.toFixed(1)),
      worstFirstVisibleLagMs: Number(worstFirstVisibleLagMs.toFixed(1)),
      completionLagOverSoftWindowCount,
      worstTraceName,
    });
  }

  console.table(summary);
  console.log(JSON.stringify({ count, profiles, summary }, null, 2));
}

await main();
