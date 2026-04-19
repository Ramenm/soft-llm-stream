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
import { buildIdleGapBenchmarkCorpus } from "./lib/trace-corpus.mjs";
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

async function evaluateProfile(profile, tuning, traces, frameMs) {
  const rows = [];

  for (const trace of traces) {
    const traceStats = summarizeTrace(trace);
    const result = await runSimulatedTraceBenchmark({ trace, tuning, frameMs });
    rows.push({
      traceName: trace.name,
      totalChars: traceStats.totalChars,
      estimatedTokens: traceStats.estimatedTokens,
      chunkCount: traceStats.chunkCount,
      meanChunkChars: traceStats.meanChunkChars,
      p90ChunkChars: traceStats.p90ChunkChars,
      maxGapMs: traceStats.maxGapMs,
      gapsOver30Sec: traceStats.gapsOver30Sec,
      gapsOver60Sec: traceStats.gapsOver60Sec,
      totalDurationMs: traceStats.totalDurationMs,
      velocityCv: result.metrics.velocityCv,
      completionSnapFactor: result.metrics.completionSnapFactor,
      completionLagMs: result.metrics.completionLagMs,
      firstVisibleLagMs: result.metrics.firstVisibleLagMs,
      maxAvoidableStallMs: result.metrics.maxAvoidableStallMs,
      backlogHorizonBandCoverage: result.metrics.backlogHorizonBandCoverage,
      delayedLargeBatchCount: result.gapBurstMetrics.delayedLargeBatchCount,
      maxFirstJumpShare: result.gapBurstMetrics.maxFirstJumpShare,
      maxFirstThreeJumpShare: result.gapBurstMetrics.maxFirstThreeJumpShare,
      shareAfter250MsCaseCount: result.gapBurstMetrics.shareAfter250MsCaseCount,
      maxShareAfter250Ms: result.gapBurstMetrics.maxShareAfter250Ms,
      shareAfter750MsCaseCount: result.gapBurstMetrics.shareAfter750MsCaseCount,
      maxShareAfter750Ms: result.gapBurstMetrics.maxShareAfter750Ms,
      minShareAfter750Ms: result.gapBurstMetrics.minShareAfter750Ms,
      minUpdatesBeforeDrain: result.gapBurstMetrics.minUpdatesBeforeDrain,
    });
  }

  const rowsWithDelayedBatches = rows.filter((row) => row.delayedLargeBatchCount > 0);
  const rowsWith250MsWindow = rows.filter((row) => row.shareAfter250MsCaseCount > 0);
  const rowsWith750MsWindow = rows.filter((row) => row.shareAfter750MsCaseCount > 0);

  return {
    profile,
    traces: rows.length,
    traceCharsMean: mean(rows.map((row) => row.totalChars)),
    traceTokensMean: mean(rows.map((row) => row.estimatedTokens)),
    chunkCountMean: mean(rows.map((row) => row.chunkCount)),
    meanChunkCharsMean: mean(rows.map((row) => row.meanChunkChars)),
    p90ChunkCharsP95: percentile(rows.map((row) => row.p90ChunkChars), 0.95),
    maxGapP95: percentile(rows.map((row) => row.maxGapMs), 0.95),
    gapsOver30SecMean: mean(rows.map((row) => row.gapsOver30Sec)),
    gapsOver60SecMean: mean(rows.map((row) => row.gapsOver60Sec)),
    totalDurationP95: percentile(rows.map((row) => row.totalDurationMs), 0.95),
    velocityCvMean: mean(rows.map((row) => row.velocityCv)),
    velocityCvP95: percentile(rows.map((row) => row.velocityCv), 0.95),
    completionSnapP95: percentile(
      rows.map((row) => row.completionSnapFactor),
      0.95,
    ),
    completionLagP95: percentile(rows.map((row) => row.completionLagMs), 0.95),
    firstVisibleLagP95: percentile(rows.map((row) => row.firstVisibleLagMs), 0.95),
    maxAvoidableStallP95: percentile(
      rows.map((row) => row.maxAvoidableStallMs),
      0.95,
    ),
    bandCoverageMean: mean(
      rows.map((row) => row.backlogHorizonBandCoverage),
    ),
    delayedLargeBatchCases: rows.reduce(
      (sum, row) => sum + row.delayedLargeBatchCount,
      0,
    ),
    firstJumpShareP95:
      rowsWithDelayedBatches.length > 0
        ? percentile(rowsWithDelayedBatches.map((row) => row.maxFirstJumpShare), 0.95)
        : 0,
    firstThreeJumpShareP95:
      rowsWithDelayedBatches.length > 0
        ? percentile(rowsWithDelayedBatches.map((row) => row.maxFirstThreeJumpShare), 0.95)
        : 0,
    shareAfter250MsP95:
      rowsWith250MsWindow.length > 0
        ? percentile(rowsWith250MsWindow.map((row) => row.maxShareAfter250Ms), 0.95)
        : 0,
    shareAfter750MsP95:
      rowsWith750MsWindow.length > 0
        ? percentile(rowsWith750MsWindow.map((row) => row.maxShareAfter750Ms), 0.95)
        : 0,
    shareAfter750MsMin:
      rowsWith750MsWindow.length > 0
        ? Math.min(...rowsWith750MsWindow.map((row) => row.minShareAfter750Ms))
        : 0,
    updatesBeforeDrainMin:
      rowsWithDelayedBatches.length > 0
        ? Math.min(...rowsWithDelayedBatches.map((row) => row.minUpdatesBeforeDrain))
        : 0,
  };
}

function runPerfBatch(traces, tuning, rounds, frameMs) {
  let totalEvents = 0;
  let totalChars = 0;
  let totalSamples = 0;
  const startedAt = performance.now();

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    for (const trace of traces) {
      const result = simulateTrace({ trace, tuning, frameMs });
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
    eventsPerSec: totalEvents / Math.max(0.001, elapsedMs / 1000),
    charsPerSec: totalChars / Math.max(0.001, elapsedMs / 1000),
    samplesPerSec: totalSamples / Math.max(0.001, elapsedMs / 1000),
    microsecondsPerEvent: (elapsedMs * 1000) / Math.max(1, totalEvents),
    microsecondsPerFrame: (elapsedMs * 1000) / Math.max(1, totalSamples),
  };
}

async function main() {
  const targetTokens = Math.max(1000, Number(process.env.IDLE_TARGET_TOKENS) || 50000);
  const scale = Math.max(0.1, Number(process.env.IDLE_SCALE) || 1);
  const frameMs = Math.max(16, Number(process.env.IDLE_FRAME_MS) || 250);
  const rounds = Math.max(1, Number(process.env.IDLE_PERF_ROUNDS) || 1);
  const profiles = String(process.env.IDLE_PROFILES || "balanced,fastFirst,softFinish")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const traces = buildIdleGapBenchmarkCorpus({ targetTokens, scale });

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
      gapsOver10Sec: stats.gapsOver10Sec,
      gapsOver30Sec: stats.gapsOver30Sec,
      gapsOver60Sec: stats.gapsOver60Sec,
      totalDurationMs: stats.totalDurationMs,
      durationMinutes: stats.durationMinutes,
    };
  });

  console.table(
    coverage.map((row) => ({
      traceName: row.traceName,
      estTokens: round(row.estimatedTokens, 0),
      totalChars: row.totalChars,
      firstDelaySec: round(row.firstDelayMs / 1000, 1),
      chunks: row.chunks,
      meanChunkChars: round(row.meanChunkChars, 1),
      p90ChunkChars: round(row.p90ChunkChars, 0),
      maxChunkChars: round(row.maxChunkChars, 0),
      meanGapSec: round(row.meanGapMs / 1000, 2),
      p90GapSec: round(row.p90GapMs / 1000, 1),
      maxGapSec: round(row.maxGapMs / 1000, 1),
      gapsOver10Sec: row.gapsOver10Sec,
      gapsOver30Sec: row.gapsOver30Sec,
      gapsOver60Sec: row.gapsOver60Sec,
      durationMin: round(row.durationMinutes, 1),
    })),
  );

  const profileRows = [];
  for (const profile of profiles) {
    const tuning = PROFILE_MAP[profile];
    if (!tuning) {
      throw new Error(`Unknown profile: ${profile}`);
    }
    profileRows.push(await evaluateProfile(profile, tuning, traces, frameMs));
  }

  console.table(
    profileRows.map((row) => ({
      profile: row.profile,
      frameMs,
      traces: row.traces,
      traceTokensMean: round(row.traceTokensMean, 0),
      traceCharsMean: round(row.traceCharsMean, 0),
      chunkCountMean: round(row.chunkCountMean, 1),
      meanChunkCharsMean: round(row.meanChunkCharsMean, 1),
      p90ChunkCharsP95: round(row.p90ChunkCharsP95, 0),
      maxGapSecP95: round(row.maxGapP95 / 1000, 1),
      gapsOver30SecMean: round(row.gapsOver30SecMean, 1),
      gapsOver60SecMean: round(row.gapsOver60SecMean, 1),
      durationMinP95: round(row.totalDurationP95 / 60_000, 1),
      velocityCvMean: round(row.velocityCvMean, 3),
      velocityCvP95: round(row.velocityCvP95, 3),
      completionSnapP95: round(row.completionSnapP95, 3),
      completionLagP95: round(row.completionLagP95, 1),
      firstVisibleLagP95: round(row.firstVisibleLagP95, 1),
      maxAvoidableStallSecP95: round(row.maxAvoidableStallP95 / 1000, 1),
      bandCoverageMean: round(row.bandCoverageMean, 3),
      delayedCases: row.delayedLargeBatchCases,
      firstJumpShareP95: round(row.firstJumpShareP95, 3),
      firstThreeJumpShareP95: round(row.firstThreeJumpShareP95, 3),
      shareAfter250MsP95: round(row.shareAfter250MsP95, 3),
      shareAfter750MsP95: round(row.shareAfter750MsP95, 3),
      shareAfter750MsMin: round(row.shareAfter750MsMin, 3),
      updatesBeforeDrainMin: row.updatesBeforeDrainMin,
    })),
  );

  const beforeHeapMb = measureHeapMb();
  const perfRows = [];
  for (const profile of profiles) {
    const tuning = PROFILE_MAP[profile];
    perfRows.push({
      profile,
      ...runPerfBatch(traces, tuning, rounds, frameMs),
    });
  }
  const afterHeapMb = measureHeapMb();

  console.table(
    perfRows.map((row) => ({
      profile: row.profile,
      frameMs,
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
        frameMs,
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
