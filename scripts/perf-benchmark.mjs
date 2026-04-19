import { performance } from 'node:perf_hooks';

import { DEFAULT_REVEAL_TUNING, FAST_FIRST_REVEAL_TUNING, SOFT_FINISH_REVEAL_TUNING, simulateTrace } from '../dist/internal.js';
import { buildStressCorpus } from './lib/trace-corpus.mjs';

function formatNumber(value, digits = 1) {
  return Number(value.toFixed(digits));
}

function measureHeapMb() {
  if (typeof global.gc === 'function') {
    global.gc();
  }
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

function runBatch(traces, tuning, rounds) {
  let totalEvents = 0;
  let totalChars = 0;
  let totalSamples = 0;
  const startedAt = performance.now();

  for (let round = 0; round < rounds; round += 1) {
    for (const trace of traces) {
      const result = simulateTrace({ trace, tuning });
      totalEvents += trace.events.length;
      totalChars += result.finalText.length;
      totalSamples += result.samples.length;
    }
  }

  const elapsedMs = performance.now() - startedAt;

  return {
    traces: traces.length * rounds,
    events: totalEvents,
    chars: totalChars,
    samples: totalSamples,
    elapsedMs,
    tracesPerSec: (traces.length * rounds) / (elapsedMs / 1000),
    eventsPerSec: totalEvents / (elapsedMs / 1000),
    charsPerSec: totalChars / (elapsedMs / 1000),
    samplesPerSec: totalSamples / (elapsedMs / 1000),
    microsecondsPerEvent: (elapsedMs * 1000) / Math.max(1, totalEvents),
    microsecondsPerFrame: (elapsedMs * 1000) / Math.max(1, totalSamples),
  };
}

function createCorpora(count) {
  const all = buildStressCorpus({ count });
  return {
    mixed: all,
    thousandEvents: all.filter((_, index) => index % 6 === 5),
    delayedFirstToken: all.filter((_, index) => index % 6 === 4),
    completionTail: all.filter((_, index) => index % 6 === 3),
  };
}

async function main() {
  const count = Math.max(6, Number(process.env.PERF_TRACE_COUNT) || 600);
  const rounds = Math.max(1, Number(process.env.PERF_ROUNDS) || 3);
  const profile = process.env.PERF_PROFILE || 'balanced';
  const corpora = createCorpora(count);
  const tuningByProfile = {
    balanced: DEFAULT_REVEAL_TUNING,
    fastFirst: FAST_FIRST_REVEAL_TUNING,
    softFinish: SOFT_FINISH_REVEAL_TUNING,
  };
  const tuning = tuningByProfile[profile] ?? DEFAULT_REVEAL_TUNING;
  const beforeHeapMb = measureHeapMb();
  const rows = [];

  for (const [name, traces] of Object.entries(corpora)) {
    const metrics = runBatch(traces, tuning, rounds);
    rows.push({
      corpus: name,
      traces: metrics.traces,
      events: metrics.events,
      samples: metrics.samples,
      elapsedMs: formatNumber(metrics.elapsedMs, 1),
      tracesPerSec: formatNumber(metrics.tracesPerSec, 1),
      eventsPerSec: formatNumber(metrics.eventsPerSec, 1),
      samplesPerSec: formatNumber(metrics.samplesPerSec, 1),
      usPerEvent: formatNumber(metrics.microsecondsPerEvent, 2),
      usPerFrame: formatNumber(metrics.microsecondsPerFrame, 2),
    });
  }

  const afterHeapMb = measureHeapMb();
  console.table(rows);
  console.log(
    JSON.stringify(
      {
        profile,
        traceCount: count,
        rounds,
        heapDeltaMb: formatNumber(afterHeapMb - beforeHeapMb, 3),
        rows,
      },
      null,
      2,
    ),
  );
}

await main();
