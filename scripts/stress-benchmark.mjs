import {
  DEFAULT_REVEAL_TUNING,
  FAST_FIRST_REVEAL_TUNING,
  SOFT_FINISH_REVEAL_TUNING,
} from "../dist/internal.js";
import { summarizeTrace } from "./lib/random-trace.mjs";
import { buildStressCorpus } from "./lib/trace-corpus.mjs";
import { runSimulatedTraceBenchmark } from "./lib/smoothness-harness.mjs";

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

async function evaluateStrategy(name, tuning, traces) {
  const metrics = [];

  for (const trace of traces) {
    const result = await runSimulatedTraceBenchmark({ trace, tuning });
    metrics.push(result.metrics);
  }

  return {
    strategy: name,
    traces: traces.length,
    velocityCvMean: mean(metrics.map((row) => row.velocityCv)),
    velocityCvP95: percentile(metrics.map((row) => row.velocityCv), 0.95),
    completionSnapMean: mean(metrics.map((row) => row.completionSnapFactor)),
    completionSnapP95: percentile(
      metrics.map((row) => row.completionSnapFactor),
      0.95,
    ),
    completionLagMean: mean(metrics.map((row) => row.completionLagMs)),
    completionLagP95: percentile(metrics.map((row) => row.completionLagMs), 0.95),
    firstVisibleLagMean: mean(metrics.map((row) => row.firstVisibleLagMs)),
    firstVisibleLagP95: percentile(
      metrics.map((row) => row.firstVisibleLagMs),
      0.95,
    ),
    stallP95: percentile(metrics.map((row) => row.maxAvoidableStallMs), 0.95),
    bandCoverageMean: mean(
      metrics.map((row) => row.backlogHorizonBandCoverage),
    ),
  };
}

async function main() {
  const count = Math.max(1, Number(process.env.STRESS_TRACE_COUNT) || 1000);
  const traces = buildStressCorpus({ count });
  const traceStats = traces.map((trace) => summarizeTrace(trace));
  const strategies = {
    balanced: DEFAULT_REVEAL_TUNING,
    fastFirst: FAST_FIRST_REVEAL_TUNING,
    softFinish: SOFT_FINISH_REVEAL_TUNING,
  };
  const rows = [];

  console.table([
    {
      traces: traces.length,
      traceCharsMean: Number(mean(traceStats.map((row) => row.totalChars)).toFixed(0)),
      traceCharsP95: Number(percentile(traceStats.map((row) => row.totalChars), 0.95).toFixed(0)),
      chunkCountMean: Number(mean(traceStats.map((row) => row.chunkCount)).toFixed(1)),
      meanChunkCharsMean: Number(mean(traceStats.map((row) => row.meanChunkChars)).toFixed(1)),
      p90ChunkCharsP95: Number(percentile(traceStats.map((row) => row.p90ChunkChars), 0.95).toFixed(0)),
    },
  ]);

  for (const [name, tuning] of Object.entries(strategies)) {
    rows.push(await evaluateStrategy(name, tuning, traces));
  }

  console.table(
    rows.map((row) => ({
      strategy: row.strategy,
      traces: row.traces,
      velocityCvMean: Number(row.velocityCvMean.toFixed(3)),
      velocityCvP95: Number(row.velocityCvP95.toFixed(3)),
      completionSnapMean: Number(row.completionSnapMean.toFixed(3)),
      completionSnapP95: Number(row.completionSnapP95.toFixed(3)),
      completionLagMean: Number(row.completionLagMean.toFixed(1)),
      completionLagP95: Number(row.completionLagP95.toFixed(1)),
      firstVisibleLagMean: Number(row.firstVisibleLagMean.toFixed(1)),
      firstVisibleLagP95: Number(row.firstVisibleLagP95.toFixed(1)),
      stallP95: Number(row.stallP95.toFixed(1)),
      bandCoverageMean: Number(row.bandCoverageMean.toFixed(3)),
    })),
  );

  console.log(JSON.stringify(rows, null, 2));
}

await main();
