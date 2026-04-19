import {
  DEFAULT_REVEAL_TUNING,
  FAST_FIRST_REVEAL_TUNING,
  SOFT_FINISH_REVEAL_TUNING,
} from "../dist/internal.js";
import { summarizeTrace } from "./lib/random-trace.mjs";
import { buildLongOutputBenchmarkCorpus } from "./lib/trace-corpus.mjs";
import {
  runRealtimeTraceBenchmark,
  runSimulatedTraceBenchmark,
} from "./lib/smoothness-harness.mjs";

const STRATEGIES = {
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

async function evaluateProfile(profile, tuning, traces) {
  const rows = [];

  for (const trace of traces) {
    const traceStats = summarizeTrace(trace);
    const result = await runSimulatedTraceBenchmark({ trace, tuning });
    rows.push({
      traceName: trace.name,
      totalChars: traceStats.totalChars,
      chunkCount: traceStats.chunkCount,
      meanChunkChars: traceStats.meanChunkChars,
      p90ChunkChars: traceStats.p90ChunkChars,
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
    traceCharsP95: percentile(rows.map((row) => row.totalChars), 0.95),
    chunkCountMean: mean(rows.map((row) => row.chunkCount)),
    meanChunkCharsMean: mean(rows.map((row) => row.meanChunkChars)),
    p90ChunkCharsP95: percentile(rows.map((row) => row.p90ChunkChars), 0.95),
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

async function main() {
  const scale = Math.max(1, Number(process.env.LONG_TRACE_SCALE) || 1);
  const realtimeCount = Math.max(0, Number(process.env.LONG_REALTIME_TRACES) || 1);
  const traces = buildLongOutputBenchmarkCorpus({ scale });
  const coverage = traces.map((trace) => {
    const stats = summarizeTrace(trace);
    return {
      traceName: trace.name,
      totalChars: stats.totalChars,
      chunks: stats.chunkCount,
      meanChunkChars: stats.meanChunkChars,
      p90ChunkChars: stats.p90ChunkChars,
      maxChunkChars: stats.maxChunkChars,
      totalDurationMs: stats.totalDurationMs,
      charsPerSecond: stats.charsPerSecond,
    };
  });

  console.table(
    coverage.map((row) => ({
      traceName: row.traceName,
      totalChars: row.totalChars,
      chunks: row.chunks,
      meanChunkChars: round(row.meanChunkChars, 1),
      p90ChunkChars: round(row.p90ChunkChars, 0),
      maxChunkChars: round(row.maxChunkChars, 0),
      totalDurationMs: round(row.totalDurationMs, 0),
      charsPerSecond: round(row.charsPerSecond, 0),
    })),
  );

  const profileRows = [];
  for (const [profile, tuning] of Object.entries(STRATEGIES)) {
    profileRows.push(await evaluateProfile(profile, tuning, traces));
  }

  console.table(
    profileRows.map((row) => ({
      profile: row.profile,
      traces: row.traces,
      traceCharsMean: round(row.traceCharsMean, 0),
      traceCharsP95: round(row.traceCharsP95, 0),
      chunkCountMean: round(row.chunkCountMean, 1),
      meanChunkCharsMean: round(row.meanChunkCharsMean, 1),
      p90ChunkCharsP95: round(row.p90ChunkCharsP95, 0),
      velocityCvMean: round(row.velocityCvMean, 3),
      velocityCvP95: round(row.velocityCvP95, 3),
      completionSnapP95: round(row.completionSnapP95, 3),
      completionLagP95: round(row.completionLagP95, 1),
      firstVisibleLagP95: round(row.firstVisibleLagP95, 1),
      bandCoverageMean: round(row.bandCoverageMean, 3),
    })),
  );

  const realtime = [];
  for (const trace of traces.slice(0, realtimeCount)) {
    const stats = summarizeTrace(trace);
    const result = await runRealtimeTraceBenchmark({ trace });
    realtime.push({
      traceName: trace.name,
      totalChars: stats.totalChars,
      meanChunkChars: stats.meanChunkChars,
      velocityCv: result.metrics.velocityCv,
      completionLagMs: result.metrics.completionLagMs,
      firstVisibleLagMs: result.metrics.firstVisibleLagMs,
    });
  }

  if (realtime.length > 0) {
    console.table(
      realtime.map((row) => ({
        traceName: row.traceName,
        totalChars: row.totalChars,
        meanChunkChars: round(row.meanChunkChars, 1),
        velocityCv: round(row.velocityCv, 3),
        completionLagMs: round(row.completionLagMs, 1),
        firstVisibleLagMs: round(row.firstVisibleLagMs, 1),
      })),
    );
  }

  console.log(
    JSON.stringify(
      {
        scale,
        coverage,
        profiles: profileRows,
        realtime,
      },
      null,
      2,
    ),
  );
}

await main();
