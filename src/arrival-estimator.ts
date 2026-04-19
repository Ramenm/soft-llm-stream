import type { RevealTuning } from "./core-types.js";
import { clamp, positiveOr } from "./core-utils.js";


function compareNumber(left: number, right: number) {
  return left - right;
}

function getQuantileFromSorted(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0;
  }

  const safeRatio = clamp(ratio, 0, 1);
  const index = (values.length - 1) * safeRatio;
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);

  if (lowerIndex === upperIndex) {
    return values[lowerIndex];
  }

  const remainder = index - lowerIndex;
  return values[lowerIndex] + (values[upperIndex] - values[lowerIndex]) * remainder;
}

function getMedianFromSorted(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[middle]
    : (values[middle - 1] + values[middle]) / 2;
}

function getWinsorizedMean(
  values: number[],
  sortedValues: number[],
  lowerRatio = 0.1,
  upperRatio = 0.9,
) {
  if (values.length === 0) {
    return 0;
  }

  if (values.length < 3) {
    let total = 0;
    for (const value of values) {
      total += value;
    }
    return total / values.length;
  }

  const lower = getQuantileFromSorted(sortedValues, lowerRatio);
  const upper = getQuantileFromSorted(sortedValues, upperRatio);

  let total = 0;
  for (const value of values) {
    total += clamp(value, lower, upper);
  }

  return total / values.length;
}

type ArrivalSample = {
  gapMs: number;
  chunkChars: number;
};

type ArrivalEstimateCache = {
  arrivalRateCharsPerMs: number;
  meanGapMs: number;
  jitterBaseMs: number;
  meanChunkChars: number;
  sampleCount: number;
};

export type ArrivalEstimatorState = {
  lastChunkAt: number | null;
  firstChunkChars: number;
  samples: ArrivalSample[];
  cache: ArrivalEstimateCache | null;
  dirty: boolean;
};

export type ArrivalEstimate = {
  arrivalRateCharsPerMs: number;
  meanGapMs: number;
  predictedGapMs: number;
  jitterMs: number;
  meanChunkChars: number;
  sampleCount: number;
};

export function createArrivalEstimator(): ArrivalEstimatorState {
  return {
    lastChunkAt: null,
    firstChunkChars: 0,
    samples: [],
    cache: null,
    dirty: false,
  };
}

export function resetArrivalEstimator(state: ArrivalEstimatorState) {
  state.lastChunkAt = null;
  state.firstChunkChars = 0;
  state.samples.length = 0;
  state.cache = null;
  state.dirty = false;
}

export function noteArrival(
  state: ArrivalEstimatorState,
  chunkText: string | number,
  at: number,
  tuning: RevealTuning,
) {
  const chunkChars =
    typeof chunkText === "number" ? Math.max(0, chunkText) : chunkText.length;

  if (chunkChars <= 0) {
    return;
  }

  if (state.lastChunkAt == null) {
    state.firstChunkChars = Math.max(state.firstChunkChars, chunkChars);
    state.lastChunkAt = at;
    state.cache = null;
    state.dirty = false;
    return;
  }

  const gapMs = Math.max(1, at - state.lastChunkAt);
  state.samples.push({ gapMs, chunkChars });

  while (state.samples.length > tuning.estimatorWindowSize) {
    state.samples.shift();
  }

  state.lastChunkAt = at;
  state.dirty = true;
}

function buildArrivalEstimateCache(
  state: ArrivalEstimatorState,
  tuning: RevealTuning,
): ArrivalEstimateCache {
  const gaps = new Array<number>(state.samples.length);
  const chunkSizes = new Array<number>(state.samples.length);
  let totalGapMs = 0;
  let totalChunkChars = 0;

  for (let index = 0; index < state.samples.length; index += 1) {
    const sample = state.samples[index];
    gaps[index] = sample.gapMs;
    chunkSizes[index] = sample.chunkChars;
    totalGapMs += sample.gapMs;
    totalChunkChars += sample.chunkChars;
  }

  const sortedGaps = [...gaps].sort(compareNumber);
  const meanGapMs = Math.max(1, getWinsorizedMean(gaps, sortedGaps, 0.12, 0.88));
  const gapMedianMs = positiveOr(getMedianFromSorted(sortedGaps), meanGapMs);
  let jitterTotalMs = 0;
  for (const gapMs of gaps) {
    jitterTotalMs += Math.abs(gapMs - gapMedianMs);
  }

  const jitterBaseMs = Math.max(0, jitterTotalMs / gaps.length);
  const sortedChunkSizes = [...chunkSizes].sort(compareNumber);
  const meanChunkChars = Math.max(1, getWinsorizedMean(chunkSizes, sortedChunkSizes, 0.12, 0.88));
  const totalRate = totalChunkChars / Math.max(1, totalGapMs);
  const chunkGapRate = meanChunkChars / meanGapMs;
  const blendedRate = totalRate * 0.65 + chunkGapRate * 0.35;

  return {
    arrivalRateCharsPerMs: clamp(
      blendedRate,
      tuning.bootstrapMinRateCharsPerMs,
      tuning.estimatedRateMaxCharsPerMs,
    ),
    meanGapMs,
    jitterBaseMs,
    meanChunkChars,
    sampleCount: state.samples.length,
  };
}

export function getArrivalEstimate(
  state: ArrivalEstimatorState,
  frameMs: number,
  tuning: RevealTuning,
): ArrivalEstimate {
  if (state.samples.length === 0) {
    const meanChunkChars = Math.max(1, state.firstChunkChars || 1);
    const meanGapMs = tuning.bootstrapDefaultGapMs;
    const arrivalRateCharsPerMs = clamp(
      meanChunkChars / meanGapMs,
      tuning.bootstrapMinRateCharsPerMs,
      tuning.bootstrapMaxRateCharsPerMs,
    );

    return {
      arrivalRateCharsPerMs,
      meanGapMs,
      predictedGapMs: meanGapMs,
      jitterMs: meanGapMs * 0.15,
      meanChunkChars,
      sampleCount: 0,
    };
  }

  if (state.dirty || state.cache == null) {
    state.cache = buildArrivalEstimateCache(state, tuning);
    state.dirty = false;
  }

  const jitterMs = Math.max(frameMs, state.cache.jitterBaseMs);
  const predictedGapMs = Math.max(
    frameMs,
    state.cache.meanGapMs + jitterMs * tuning.gapJitterMultiplier,
  );

  return {
    arrivalRateCharsPerMs: state.cache.arrivalRateCharsPerMs,
    meanGapMs: state.cache.meanGapMs,
    predictedGapMs,
    jitterMs,
    meanChunkChars: state.cache.meanChunkChars,
    sampleCount: state.cache.sampleCount,
  };
}
