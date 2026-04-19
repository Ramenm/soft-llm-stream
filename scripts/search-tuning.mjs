import { DEFAULT_REVEAL_TUNING } from "../dist/internal.js";
import { buildStressCorpus } from "./lib/trace-corpus.mjs";
import { runSimulatedTraceBenchmark } from "./lib/smoothness-harness.mjs";

function createSeededRandom(seed = 12345) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function perturbValue(random, value, spread = 0.2, min = 0) {
  const scale = 1 + (random() * 2 - 1) * spread;
  return Math.max(min, value * scale);
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

function mean(values) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createCandidateTuning(random) {
  return {
    bootstrapDefaultGapMs: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.bootstrapDefaultGapMs,
      0.18,
      40,
    ),
    bootstrapSeedLookaheadMs: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.bootstrapSeedLookaheadMs,
      0.2,
      60,
    ),
    gapJitterMultiplier: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.gapJitterMultiplier,
      0.16,
      0.35,
    ),
    reserveMinFrames: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.reserveMinFrames,
      0.18,
      1,
    ),
    reserveMaxMs: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.reserveMaxMs,
      0.18,
      140,
    ),
    reserveJitterWeight: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.reserveJitterWeight,
      0.18,
      0.08,
    ),
    targetExtraMs: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.targetExtraMs,
      0.24,
      12,
    ),
    targetMaxMs: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.targetMaxMs,
      0.16,
      180,
    ),
    protectHorizonMultiplier: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.protectHorizonMultiplier,
      0.12,
      0.65,
    ),
    catchupHorizonMultiplier: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.catchupHorizonMultiplier,
      0.12,
      1.3,
    ),
    steadyControlGain: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.steadyControlGain,
      0.2,
      0.1,
    ),
    steadyMinRateFactor: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.steadyMinRateFactor,
      0.12,
      0.65,
    ),
    steadyMaxRateFactor: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.steadyMaxRateFactor,
      0.18,
      1.08,
    ),
    protectMinRateFactor: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.protectMinRateFactor,
      0.12,
      0.42,
    ),
    protectRecoveryExponent: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.protectRecoveryExponent,
      0.18,
      0.36,
    ),
    catchupMaxRateFactor: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.catchupMaxRateFactor,
      0.18,
      1.12,
    ),
    completeBaseFloorFactor: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.completeBaseFloorFactor,
      0.05,
      0.9,
    ),
    completeMaxRateFactor: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.completeMaxRateFactor,
      0.16,
      1.08,
    ),
    completeMinDurationMs: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.completeMinDurationMs,
      0.18,
      48,
    ),
    completeMaxDurationMs: perturbValue(
      random,
      DEFAULT_REVEAL_TUNING.completeMaxDurationMs,
      0.2,
      140,
    ),
    budgetBankFrames: {
      steady: perturbValue(
        random,
        DEFAULT_REVEAL_TUNING.budgetBankFrames.steady,
        0.18,
        1.3,
      ),
      protect: perturbValue(
        random,
        DEFAULT_REVEAL_TUNING.budgetBankFrames.protect,
        0.18,
        1,
      ),
      catchup: perturbValue(
        random,
        DEFAULT_REVEAL_TUNING.budgetBankFrames.catchup,
        0.2,
        1.4,
      ),
      complete: perturbValue(
        random,
        DEFAULT_REVEAL_TUNING.budgetBankFrames.complete,
        0.2,
        1.6,
      ),
    },
    rateSettleMs: {
      steady: perturbValue(
        random,
        DEFAULT_REVEAL_TUNING.rateSettleMs.steady,
        0.18,
        80,
      ),
      protect: perturbValue(
        random,
        DEFAULT_REVEAL_TUNING.rateSettleMs.protect,
        0.2,
        60,
      ),
      catchup: perturbValue(
        random,
        DEFAULT_REVEAL_TUNING.rateSettleMs.catchup,
        0.18,
        60,
      ),
      complete: perturbValue(
        random,
        DEFAULT_REVEAL_TUNING.rateSettleMs.complete,
        0.18,
        50,
      ),
    },
    maxStepChars: {
      bootstrap: Math.max(
        1,
        Math.round(
          perturbValue(random, DEFAULT_REVEAL_TUNING.maxStepChars.bootstrap, 0.25, 1),
        ),
      ),
      steady: Math.max(
        1,
        Math.round(
          perturbValue(random, DEFAULT_REVEAL_TUNING.maxStepChars.steady, 0.25, 1),
        ),
      ),
      protect: Math.max(
        1,
        Math.round(
          perturbValue(random, DEFAULT_REVEAL_TUNING.maxStepChars.protect, 0.25, 1),
        ),
      ),
      catchup: Math.max(
        2,
        Math.round(
          perturbValue(random, DEFAULT_REVEAL_TUNING.maxStepChars.catchup, 0.25, 2),
        ),
      ),
      complete: Math.max(
        1,
        Math.round(
          perturbValue(random, DEFAULT_REVEAL_TUNING.maxStepChars.complete, 0.25, 1),
        ),
      ),
    },
    stepRateMultipliers: {
      bootstrap: perturbValue(
        random,
        DEFAULT_REVEAL_TUNING.stepRateMultipliers.bootstrap,
        0.18,
        1,
      ),
      steady: perturbValue(
        random,
        DEFAULT_REVEAL_TUNING.stepRateMultipliers.steady,
        0.18,
        1,
      ),
      protect: perturbValue(
        random,
        DEFAULT_REVEAL_TUNING.stepRateMultipliers.protect,
        0.12,
        1,
      ),
      catchup: perturbValue(
        random,
        DEFAULT_REVEAL_TUNING.stepRateMultipliers.catchup,
        0.2,
        1.1,
      ),
      complete: perturbValue(
        random,
        DEFAULT_REVEAL_TUNING.stepRateMultipliers.complete,
        0.2,
        1.05,
      ),
    },
    boundaryOvershootChars: {
      bootstrap: Math.max(
        0,
        Math.round(
          perturbValue(
            random,
            DEFAULT_REVEAL_TUNING.boundaryOvershootChars.bootstrap,
            0.25,
            0,
          ),
        ),
      ),
      steady: Math.max(
        0,
        Math.round(
          perturbValue(
            random,
            DEFAULT_REVEAL_TUNING.boundaryOvershootChars.steady,
            0.25,
            0,
          ),
        ),
      ),
      protect: Math.max(
        0,
        Math.round(
          perturbValue(
            random,
            DEFAULT_REVEAL_TUNING.boundaryOvershootChars.protect,
            0.25,
            0,
          ),
        ),
      ),
      catchup: Math.max(
        0,
        Math.round(
          perturbValue(
            random,
            DEFAULT_REVEAL_TUNING.boundaryOvershootChars.catchup,
            0.25,
            0,
          ),
        ),
      ),
      complete: Math.max(
        0,
        Math.round(
          perturbValue(
            random,
            DEFAULT_REVEAL_TUNING.boundaryOvershootChars.complete,
            0.25,
            0,
          ),
        ),
      ),
    },
  };
}

function mergeCandidate(candidate) {
  return {
    ...candidate,
    budgetBankFrames: {
      ...DEFAULT_REVEAL_TUNING.budgetBankFrames,
      ...(candidate.budgetBankFrames ?? {}),
    },
    rateSettleMs: {
      ...DEFAULT_REVEAL_TUNING.rateSettleMs,
      ...(candidate.rateSettleMs ?? {}),
    },
    maxStepChars: {
      ...DEFAULT_REVEAL_TUNING.maxStepChars,
      ...(candidate.maxStepChars ?? {}),
    },
    stepRateMultipliers: {
      ...DEFAULT_REVEAL_TUNING.stepRateMultipliers,
      ...(candidate.stepRateMultipliers ?? {}),
    },
    boundaryOvershootChars: {
      ...DEFAULT_REVEAL_TUNING.boundaryOvershootChars,
      ...(candidate.boundaryOvershootChars ?? {}),
    },
  };
}

function scoreMetrics(metrics) {
  const penalties = [];
  penalties.push(metrics.velocityCv * 1.2);
  penalties.push(metrics.meanJerk * 2.4);
  penalties.push(metrics.maxAvoidableStallMs / 140);
  penalties.push(metrics.firstVisibleLagMs / 28);
  penalties.push(metrics.completionLagMs / 320);
  penalties.push(Math.max(0, metrics.completionSnapFactor - 2.2) * 1.8);
  penalties.push(Math.max(0, 0.92 - metrics.backlogHorizonBandCoverage) * 7);
  return penalties.reduce((total, value) => total + value, 0);
}

async function evaluateCandidate(name, tuning, traces) {
  const rows = [];

  for (const trace of traces) {
    const result = await runSimulatedTraceBenchmark({
      trace,
      tuning,
    });
    rows.push(result.metrics);
  }

  const score = mean(rows.map((metrics) => scoreMetrics(metrics)));

  return {
    name,
    score,
    velocityCvMean: mean(rows.map((metrics) => metrics.velocityCv)),
    velocityCvP95: percentile(rows.map((metrics) => metrics.velocityCv), 0.95),
    completionSnapP95: percentile(
      rows.map((metrics) => metrics.completionSnapFactor),
      0.95,
    ),
    completionLagP95: percentile(rows.map((metrics) => metrics.completionLagMs), 0.95),
    firstVisibleLagP95: percentile(
      rows.map((metrics) => metrics.firstVisibleLagMs),
      0.95,
    ),
    stallP95: percentile(rows.map((metrics) => metrics.maxAvoidableStallMs), 0.95),
    bandCoverageMean: mean(
      rows.map((metrics) => metrics.backlogHorizonBandCoverage),
    ),
    tuning,
  };
}

async function main() {
  const traces = buildStressCorpus({
    count: Math.max(60, Number(process.env.SEARCH_TRACE_COUNT) || 240),
  });
  const random = createSeededRandom(20260417);
  const candidateCount = Math.max(8, Number(process.env.SEARCH_CANDIDATES) || 48);
  const candidates = [{ name: "default", tuning: DEFAULT_REVEAL_TUNING }];

  for (let index = 0; index < candidateCount; index += 1) {
    candidates.push({
      name: `candidate-${String(index + 1).padStart(2, "0")}`,
      tuning: mergeCandidate(createCandidateTuning(random)),
    });
  }

  const results = [];
  for (const candidate of candidates) {
    results.push(await evaluateCandidate(candidate.name, candidate.tuning, traces));
  }

  results.sort((left, right) => left.score - right.score);

  console.table(
    results.slice(0, 12).map((result) => ({
      name: result.name,
      score: Number(result.score.toFixed(3)),
      velocityCvMean: Number(result.velocityCvMean.toFixed(3)),
      velocityCvP95: Number(result.velocityCvP95.toFixed(3)),
      completionSnapP95: Number(result.completionSnapP95.toFixed(3)),
      completionLagP95: Number(result.completionLagP95.toFixed(1)),
      firstVisibleLagP95: Number(result.firstVisibleLagP95.toFixed(1)),
      stallP95: Number(result.stallP95.toFixed(1)),
      bandCoverageMean: Number(result.bandCoverageMean.toFixed(3)),
    })),
  );
  console.log(JSON.stringify(results.slice(0, 5), null, 2));
}

await main();
