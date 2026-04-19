import { DEFAULT_REVEAL_TUNING, FAST_FIRST_REVEAL_TUNING, SOFT_FINISH_REVEAL_TUNING } from "../dist/internal.js";
import { buildBenchmarkCorpus } from "./lib/trace-corpus.mjs";
import { runSimulatedTraceBenchmark } from "./lib/smoothness-harness.mjs";

const LEGACY_REWRITE_BASELINE = {
  estimatorWindowSize: 12,
  bootstrapDefaultGapMs: 120,
  bootstrapSeedLookaheadMs: 120,
  bootstrapMinRateCharsPerMs: 1 / 70,
  bootstrapMaxRateCharsPerMs: 0.18,
  estimatedRateMaxCharsPerMs: 1.2,
  gapJitterMultiplier: 0.85,
  reserveMinFrames: 1.35,
  reserveMaxMs: 220,
  reserveJitterWeight: 0.85,
  targetExtraMs: 28,
  targetMaxMs: 320,
  protectHorizonMultiplier: 0.9,
  catchupHorizonMultiplier: 1.65,
  steadyControlGain: 0.36,
  steadyMinRateFactor: 0.82,
  steadyMaxRateFactor: 1.22,
  protectMinRateFactor: 0.56,
  protectRecoveryExponent: 0.68,
  catchupMaxRateFactor: 1.48,
  completeBaseFloorFactor: 0.98,
  completeMaxRateFactor: 1.35,
  completeMinDurationMs: 110,
  completeMaxDurationMs: 480,
  rateSettleMs: {
    bootstrap: 90,
    steady: 170,
    protect: 120,
    catchup: 120,
    complete: 95,
  },
  budgetBankFrames: {
    bootstrap: 1.8,
    steady: 2.15,
    protect: 1.4,
    catchup: 2.65,
    complete: 2.8,
  },
  maxStepChars: {
    bootstrap: 2,
    steady: 2,
    protect: 1,
    catchup: 3,
    complete: 4,
  },
  boundaryOvershootChars: {
    bootstrap: 1,
    steady: 1,
    protect: 0,
    catchup: 2,
    complete: 1,
  },
};

const STRATEGIES = {
  "legacy-rewrite-baseline": LEGACY_REWRITE_BASELINE,
  balanced: DEFAULT_REVEAL_TUNING,
  fastFirst: FAST_FIRST_REVEAL_TUNING,
  softFinish: SOFT_FINISH_REVEAL_TUNING,
};

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.floor((sorted.length - 1) * ratio);
  return sorted[index];
}

async function evaluateStrategy(name, tuning, traces) {
  const metrics = [];

  for (const trace of traces) {
    const result = await runSimulatedTraceBenchmark({ trace, tuning });
    metrics.push(result.metrics);
  }

  return {
    strategy: name,
    velocityCvMean:
      metrics.reduce((sum, row) => sum + row.velocityCv, 0) / metrics.length,
    velocityCvP95: percentile(metrics.map((row) => row.velocityCv), 0.95),
    completionSnapP95: percentile(
      metrics.map((row) => row.completionSnapFactor),
      0.95,
    ),
    completionLagP95: percentile(metrics.map((row) => row.completionLagMs), 0.95),
    firstVisibleLagP95: percentile(metrics.map((row) => row.firstVisibleLagMs), 0.95),
    stallP95: percentile(metrics.map((row) => row.maxAvoidableStallMs), 0.95),
    bandCoverageMean:
      metrics.reduce((sum, row) => sum + row.backlogHorizonBandCoverage, 0) /
      metrics.length,
    timeToFirstVisibleMean:
      metrics.reduce((sum, row) => sum + row.timeToFirstVisibleMs, 0) /
      metrics.length,
  };
}

async function main() {
  const traces = await buildBenchmarkCorpus();
  const rows = [];

  for (const [name, tuning] of Object.entries(STRATEGIES)) {
    rows.push(await evaluateStrategy(name, tuning, traces));
  }

  rows.sort((left, right) => {
    if (left.firstVisibleLagP95 !== right.firstVisibleLagP95) {
      return left.firstVisibleLagP95 - right.firstVisibleLagP95;
    }
    if (left.completionLagP95 !== right.completionLagP95) {
      return left.completionLagP95 - right.completionLagP95;
    }
    if (left.completionSnapP95 !== right.completionSnapP95) {
      return left.completionSnapP95 - right.completionSnapP95;
    }
    if (left.bandCoverageMean !== right.bandCoverageMean) {
      return right.bandCoverageMean - left.bandCoverageMean;
    }
    return left.velocityCvMean - right.velocityCvMean;
  });

  console.table(
    rows.map((row) => ({
      strategy: row.strategy,
      velocityCvMean: Number(row.velocityCvMean.toFixed(3)),
      velocityCvP95: Number(row.velocityCvP95.toFixed(3)),
      completionSnapP95: Number(row.completionSnapP95.toFixed(3)),
      completionLagP95: Number(row.completionLagP95.toFixed(1)),
      firstVisibleLagP95: Number(row.firstVisibleLagP95.toFixed(1)),
      stallP95: Number(row.stallP95.toFixed(1)),
      bandCoverageMean: Number(row.bandCoverageMean.toFixed(3)),
      timeToFirstVisibleMean: Number(row.timeToFirstVisibleMean.toFixed(1)),
    })),
  );
}

await main();
