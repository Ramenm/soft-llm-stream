import { buildBenchmarkCorpus } from "./lib/trace-corpus.mjs";
import { summarizeTrace } from "./lib/random-trace.mjs";
import {
  runRealtimeTraceBenchmark,
  runSimulatedTraceBenchmark,
} from "./lib/smoothness-harness.mjs";

async function summarize(label, runner, traces) {
  const rows = [];

  for (const trace of traces) {
    const result = await runner({ trace });
    const traceStats = summarizeTrace(trace);
    rows.push({
      harness: label,
      traceName: result.traceName,
      totalChars: traceStats.totalChars,
      chunkCount: traceStats.chunkCount,
      meanChunkChars: Number(traceStats.meanChunkChars.toFixed(1)),
      p90ChunkChars: Number(traceStats.p90ChunkChars.toFixed(0)),
      velocityCv: Number(result.metrics.velocityCv.toFixed(3)),
      meanJerk: Number(result.metrics.meanJerk.toFixed(3)),
      maxAvoidableStallMs: Number(result.metrics.maxAvoidableStallMs.toFixed(1)),
      completionSnapFactor: Number(result.metrics.completionSnapFactor.toFixed(3)),
      completionLagMs: Number(result.metrics.completionLagMs.toFixed(1)),
      timeToFirstVisibleMs: Number(result.metrics.timeToFirstVisibleMs.toFixed(1)),
      firstVisibleLagMs: Number(result.metrics.firstVisibleLagMs.toFixed(1)),
      bandCoverage: Number(result.metrics.backlogHorizonBandCoverage.toFixed(3)),
    });
  }

  return rows;
}

async function main() {
  const traces = await buildBenchmarkCorpus();
  const simulatedRows = await summarize(
    "simulated",
    runSimulatedTraceBenchmark,
    traces,
  );
  const realtimeRows = await summarize(
    "realtime",
    runRealtimeTraceBenchmark,
    traces.slice(0, 6),
  );

  const rows = [...simulatedRows, ...realtimeRows];
  console.table(rows);
  console.log(JSON.stringify(rows, null, 2));
}

await main();
