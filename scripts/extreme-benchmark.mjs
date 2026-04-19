import { performance } from "node:perf_hooks";

import {
  DEFAULT_REVEAL_TUNING,
  FAST_FIRST_REVEAL_TUNING,
  SOFT_FINISH_REVEAL_TUNING,
  simulateTrace,
} from "../dist/internal.js";
import {
  estimateTokenCountFromChars,
  summarizeTrace,
} from "./lib/random-trace.mjs";
import { buildExtremeBenchmarkCorpus } from "./lib/trace-corpus.mjs";
import { runSimulatedTraceBenchmark } from "./lib/smoothness-harness.mjs";

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
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const remainder = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * remainder;
}

function round(value, digits = 1) {
  return Number(value.toFixed(digits));
}

function measureHeapMb() {
  if (typeof global.gc === "function") {
    global.gc();
  }
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

async function evaluateProfile(profile, tuning, traces) {
  const rows = [];

  for (const trace of traces) {
    const traceStats = summarizeTrace(trace);
    const result = await runSimulatedTraceBenchmark({ trace, tuning });
    rows.push({
      traceName: trace.name,
      totalChars: traceStats.totalChars,
      estimatedTokens: traceStats.estimatedTokens,
      chunkCount: traceStats.chunkCount,
      meanChunkChars: traceStats.meanChunkChars,
      p90ChunkChars: traceStats.p90ChunkChars,
      maxGapMs: traceStats.maxGapMs,
      totalDurationMs: traceStats.totalDurationMs,
      velocityCv: result.metrics.velocityCv,
      completionSnapFactor: result.metrics.completionSnapFactor,
      completionLagMs: result.metrics.completionLagMs,
      firstVisibleLagMs: result.metrics.firstVisibleLagMs,
      backlogHorizonBandCoverage: result.metrics.backlogHorizonBandCoverage,
    });
  }

  return {
    profile,
    traces: rows.length,
    traceCharsMean: mean(rows.map((row) => row.totalChars)),
    traceTokensMean: mean(rows.map((row) => row.estimatedTokens)),
    chunkCountMean: mean(rows.map((row) => row.chunkCount)),
    meanChunkCharsMean: mean(rows.map((row) => row.meanChunkChars)),
    p90ChunkCharsP95: percentile(rows.map((row) => row.p90ChunkChars), 0.95),
    maxGapP95: percentile(rows.map((row) => row.maxGapMs), 0.95),
    totalDurationP95: percentile(rows.map((row) => row.totalDurationMs), 0.95),
    velocityCvMean: mean(rows.map((row) => row.velocityCv)),
    velocityCvP95: percentile(rows.map((row) => row.velocityCv), 0.95),
    completionSnapP95: percentile(
      rows.map((row) => row.completionSnapFactor),
      0.95,
    ),
    completionLagP95: percentile(rows.map((row) => row.completionLagMs), 0.95),
    firstVisibleLagP95: percentile(rows.map((row) => row.firstVisibleLagMs), 0.95),
    bandCoverageMean: mean(
      rows.map((row) => row.backlogHorizonBandCoverage),
    ),
  };
}

function runPerfBatch(traces, tuning, rounds) {
  let totalEvents = 0;
  let totalChars = 0;
  let totalSamples = 0;
  const startedAt = performance.now();

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
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
    estimatedTokens: estimateTokenCountFromChars(totalChars),
    samples: totalSamples,
    elapsedMs,
    eventsPerSec: totalEvents / (elapsedMs / 1000),
    charsPerSec: totalChars / (elapsedMs / 1000),
    samplesPerSec: totalSamples / (elapsedMs / 1000),
    microsecondsPerEvent: (elapsedMs * 1000) / Math.max(1, totalEvents),
    microsecondsPerFrame: (elapsedMs * 1000) / Math.max(1, totalSamples),
  };
}

async function main() {
  const targetTokens = Math.max(1000, Number(process.env.EXTREME_TARGET_TOKENS) || 50000);
  const scale = Math.max(0.1, Number(process.env.EXTREME_SCALE) || 1);
  const rounds = Math.max(1, Number(process.env.EXTREME_PERF_ROUNDS) || 1);
  const profiles = String(process.env.EXTREME_PROFILES || "balanced,fastFirst,softFinish")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const traces = buildExtremeBenchmarkCorpus({ targetTokens, scale });

  const coverage = traces.map((trace) => {
    const stats = summarizeTrace(trace);
    return {
      traceName: trace.name,
      totalChars: stats.totalChars,
      estimatedTokens: stats.estimatedTokens,
      firstDelayMs: stats.firstDelayMs,
      chunks: stats.chunkCount,
      meanChunkChars: stats.meanChunkChars,
      p90ChunkChars: stats.p90ChunkChars,
      maxChunkChars: stats.maxChunkChars,
      meanGapMs: stats.meanGapMs,
      p90GapMs: stats.p90GapMs,
      maxGapMs: stats.maxGapMs,
      totalDurationMs: stats.totalDurationMs,
    };
  });

  console.table(
    coverage.map((row) => ({
      traceName: row.traceName,
      estTokens: round(row.estimatedTokens, 0),
      totalChars: row.totalChars,
      firstDelayMs: round(row.firstDelayMs, 0),
      chunks: row.chunks,
      meanChunkChars: round(row.meanChunkChars, 1),
      p90ChunkChars: round(row.p90ChunkChars, 0),
      maxChunkChars: round(row.maxChunkChars, 0),
      meanGapMs: round(row.meanGapMs, 1),
      p90GapMs: round(row.p90GapMs, 0),
      maxGapMs: round(row.maxGapMs, 0),
      totalDurationMs: round(row.totalDurationMs, 0),
    })),
  );

  const profileRows = [];
  for (const profile of profiles) {
    const tuning = PROFILE_MAP[profile];
    if (!tuning) {
      throw new Error(`Unknown profile: ${profile}`);
    }
    profileRows.push(await evaluateProfile(profile, tuning, traces));
  }

  console.table(
    profileRows.map((row) => ({
      profile: row.profile,
      traces: row.traces,
      traceTokensMean: round(row.traceTokensMean, 0),
      traceCharsMean: round(row.traceCharsMean, 0),
      chunkCountMean: round(row.chunkCountMean, 1),
      meanChunkCharsMean: round(row.meanChunkCharsMean, 1),
      p90ChunkCharsP95: round(row.p90ChunkCharsP95, 0),
      maxGapP95: round(row.maxGapP95, 0),
      totalDurationP95: round(row.totalDurationP95, 0),
      velocityCvMean: round(row.velocityCvMean, 3),
      velocityCvP95: round(row.velocityCvP95, 3),
      completionSnapP95: round(row.completionSnapP95, 3),
      completionLagP95: round(row.completionLagP95, 1),
      firstVisibleLagP95: round(row.firstVisibleLagP95, 1),
      bandCoverageMean: round(row.bandCoverageMean, 3),
    })),
  );

  const beforeHeapMb = measureHeapMb();
  const perfRows = [];
  for (const profile of profiles) {
    const tuning = PROFILE_MAP[profile];
    const metrics = runPerfBatch(traces, tuning, rounds);
    perfRows.push({
      profile,
      ...metrics,
    });
  }
  const afterHeapMb = measureHeapMb();

  console.table(
    perfRows.map((row) => ({
      profile: row.profile,
      traces: row.traces,
      events: row.events,
      estTokens: round(row.estimatedTokens, 0),
      samples: row.samples,
      elapsedMs: round(row.elapsedMs, 1),
      eventsPerSec: round(row.eventsPerSec, 1),
      charsPerSec: round(row.charsPerSec, 0),
      samplesPerSec: round(row.samplesPerSec, 0),
      usPerEvent: round(row.microsecondsPerEvent, 2),
      usPerFrame: round(row.microsecondsPerFrame, 2),
    })),
  );

  console.log(
    JSON.stringify(
      {
        targetTokens,
        scale,
        rounds,
        coverage,
        profiles: profileRows,
        performance: {
          heapDeltaMb: round(afterHeapMb - beforeHeapMb, 3),
          rows: perfRows,
        },
      },
      null,
      2,
    ),
  );
}

await main();
