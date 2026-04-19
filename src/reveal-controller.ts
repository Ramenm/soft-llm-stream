import type {
  RevealMode,
  RevealTuning,
  SoftLlmStreamDebugState,
} from "./core-types.js";
import { EMPTY_DEBUG_STATE } from "./core-types.js";
import type { CodeFenceState } from "./reveal-boundaries.js";
import { chooseSliceLength, getSliceSearchWindowChars } from "./reveal-boundaries.js";
import {
  clamp,
  DEFAULT_FRAME_MS,
  positiveOr,
  updateEma,
} from "./core-utils.js";
import {
  createArrivalEstimator,
  type ArrivalEstimate,
  type ArrivalEstimatorState,
  getArrivalEstimate,
  noteArrival,
  resetArrivalEstimator,
} from "./arrival-estimator.js";

export type RevealControllerState = {
  locale: string;
  tuning: RevealTuning;
  arrival: ArrivalEstimatorState;
  frameMs: number;
  lastPaintAt: number | null;
  visibleRateCharsPerMs: number;
  steadyReferenceRateCharsPerMs: number;
  revealBudgetChars: number;
  recoveryBudgetFramesRemaining: number;
  preferBootstrapUntilDrain: boolean;
  mode: RevealMode;
  isComplete: boolean;
  completionStartedAt: number | null;
  completionDeadlineAt: number | null;
  completionBaseRateCharsPerMs: number;
  debugState: SoftLlmStreamDebugState;
};

export type AdvanceRevealResult = {
  nextSliceEnd: number;
  debugState: SoftLlmStreamDebugState;
  suggestedDelayMs: number;
};

const RECOVERY_BUDGET_FRAME_CAP_MS = 56;
const RECOVERY_BUDGET_CAP_FRAMES = 4;

function getSuggestedDelayMs(
  state: RevealControllerState,
  estimate: ArrivalEstimate,
  nextSliceEnd: number,
  fullTextLength: number,
) {
  if (nextSliceEnd >= fullTextLength) {
    return 0;
  }

  if (state.revealBudgetChars >= 0.98) {
    return 0;
  }

  const effectiveRateCharsPerMs = Math.max(
    state.visibleRateCharsPerMs,
    1 / Math.max(state.frameMs * 24, 1),
  );
  const deficitChars = Math.max(0.05, 1 - state.revealBudgetChars);
  const minDelayMs = state.isComplete
    ? state.frameMs * 0.4
    : state.frameMs * 0.82;
  const maxDelayMs = state.isComplete
    ? Math.min(estimate.predictedGapMs, state.frameMs * 2.35)
    : Math.min(
        estimate.predictedGapMs * 0.9,
        Math.max(state.frameMs, state.frameMs * 6),
      );

  return clamp(
    deficitChars / effectiveRateCharsPerMs,
    minDelayMs,
    Math.max(minDelayMs, maxDelayMs),
  );
}

function getReserveHorizonMs(
  estimate: ArrivalEstimate,
  frameMs: number,
  tuning: RevealTuning,
) {
  return clamp(
    Math.max(
      frameMs * tuning.reserveMinFrames,
      estimate.predictedGapMs * 0.65 + estimate.jitterMs * tuning.reserveJitterWeight,
    ),
    frameMs * tuning.reserveMinFrames,
    tuning.reserveMaxMs,
  );
}

function getTargetHorizonMs(
  reserveHorizonMs: number,
  estimate: ArrivalEstimate,
  tuning: RevealTuning,
) {
  return clamp(
    Math.max(
      reserveHorizonMs + tuning.targetExtraMs,
      estimate.predictedGapMs + tuning.targetExtraMs * 0.4,
    ),
    reserveHorizonMs + tuning.targetExtraMs,
    tuning.targetMaxMs,
  );
}

function getMaxHorizonMs(
  reserveHorizonMs: number,
  targetHorizonMs: number,
  tuning: RevealTuning,
) {
  return Math.max(
    targetHorizonMs + reserveHorizonMs * 0.75,
    targetHorizonMs * tuning.catchupHorizonMultiplier,
  );
}

function updateFrameMs(state: RevealControllerState, at: number) {
  if (state.lastPaintAt != null) {
    const deltaMs = Math.max(1, at - state.lastPaintAt);
    const blend = clamp(deltaMs / (state.frameMs + deltaMs), 0.1, 0.5);
    state.frameMs = updateEma(
      positiveOr(state.frameMs, deltaMs),
      deltaMs,
      blend,
    );
  }
  state.lastPaintAt = at;
}

function getBootstrapRate(
  state: RevealControllerState,
  backlogChars: number,
  estimate: ArrivalEstimate,
) {
  const seedRate = clamp(
    backlogChars / positiveOr(state.tuning.bootstrapSeedLookaheadMs, 120),
    state.tuning.bootstrapMinRateCharsPerMs,
    state.tuning.bootstrapMaxRateCharsPerMs,
  );
  return clamp(
    Math.max(seedRate, estimate.arrivalRateCharsPerMs * 0.92),
    state.tuning.bootstrapMinRateCharsPerMs,
    state.tuning.bootstrapMaxRateCharsPerMs,
  );
}

function getProtectRate(
  state: RevealControllerState,
  estimate: ArrivalEstimate,
  backlogHorizonMs: number,
  reserveHorizonMs: number,
  elapsedSinceChunkMs: number,
) {
  const reserveRatio = clamp(
    backlogHorizonMs / Math.max(state.frameMs, reserveHorizonMs),
    0,
    1.1,
  );
  const starvationRatio = clamp(
    elapsedSinceChunkMs / Math.max(state.frameMs, estimate.predictedGapMs),
    0,
    1.8,
  );
  const recoveryFactor = Math.pow(
    Math.max(0, reserveRatio),
    state.tuning.protectRecoveryExponent,
  );
  const starvationBrake = clamp(
    1 - Math.max(0, starvationRatio - 0.75),
    state.tuning.protectMinRateFactor,
    1,
  );
  const factor = clamp(
    Math.max(
      state.tuning.protectMinRateFactor,
      recoveryFactor * starvationBrake,
    ),
    state.tuning.protectMinRateFactor,
    1,
  );

  return estimate.arrivalRateCharsPerMs * factor;
}

function getSteadyRate(
  state: RevealControllerState,
  estimate: ArrivalEstimate,
  backlogHorizonMs: number,
  targetHorizonMs: number,
) {
  const errorRatio = clamp(
    (backlogHorizonMs - targetHorizonMs) / Math.max(targetHorizonMs, state.frameMs),
    -0.9,
    1.5,
  );
  const factor = clamp(
    1 + errorRatio * state.tuning.steadyControlGain,
    state.tuning.steadyMinRateFactor,
    state.tuning.steadyMaxRateFactor,
  );

  return estimate.arrivalRateCharsPerMs * factor;
}

function getCatchupRate(
  state: RevealControllerState,
  estimate: ArrivalEstimate,
  backlogHorizonMs: number,
  targetHorizonMs: number,
) {
  const excessRatio = clamp(
    (backlogHorizonMs - targetHorizonMs) / Math.max(targetHorizonMs, state.frameMs),
    0,
    2.2,
  );
  const factor = clamp(
    1 + excessRatio * state.tuning.steadyControlGain * 0.95,
    1.02,
    state.tuning.catchupMaxRateFactor,
  );

  return estimate.arrivalRateCharsPerMs * factor;
}

function getCompletionRate(
  state: RevealControllerState,
  estimate: ArrivalEstimate,
  backlogChars: number,
  at: number,
) {
  const frameMs = positiveOr(state.frameMs, DEFAULT_FRAME_MS);

  if (state.completionStartedAt == null) {
    const seededBaseRate = Math.max(
      state.completionBaseRateCharsPerMs,
      state.visibleRateCharsPerMs,
      state.steadyReferenceRateCharsPerMs,
      estimate.arrivalRateCharsPerMs,
      1 / frameMs,
    );
    state.completionStartedAt = at;
    state.completionBaseRateCharsPerMs = seededBaseRate;
    const naturalDurationMs = backlogChars / Math.max(seededBaseRate, Number.EPSILON);
    const deadlineDurationMs = clamp(
      naturalDurationMs,
      state.tuning.completeMinDurationMs,
      state.tuning.completeMaxDurationMs,
    );
    state.completionDeadlineAt = at + deadlineDurationMs;
  }

  const baseRate = Math.max(
    state.completionBaseRateCharsPerMs,
    1 / frameMs,
  );
  const deadlineAt = state.completionDeadlineAt ?? (at + frameMs);
  const remainingMs = Math.max(frameMs, deadlineAt - at);
  const requiredRate = backlogChars / remainingMs;
  const pressureRatio = clamp(
    requiredRate / Math.max(baseRate, 1 / frameMs),
    1,
    18,
  );
  const largeBacklogFloorChars = Math.max(240, estimate.meanChunkChars * 3.5);
  const excessBacklogChars = Math.max(0, backlogChars - largeBacklogFloorChars);
  const backlogBoostFactor =
    excessBacklogChars > 0
      ? 1 + Math.min(14, Math.sqrt(excessBacklogChars / 420) * 1.05)
      : 1;
  const pressureBoostFactor =
    excessBacklogChars > 0
      ? 1 + Math.min(8, Math.pow(Math.max(0, pressureRatio - 1), 0.7) * 0.72)
      : 1;
  const capFactor = Math.max(
    state.tuning.completeMaxRateFactor + Math.min(0.08, backlogChars / 320),
    backlogBoostFactor,
    pressureBoostFactor,
  );
  const maxRate = baseRate * capFactor;

  return clamp(
    requiredRate,
    baseRate * state.tuning.completeBaseFloorFactor,
    maxRate,
  );
}

function applySlewLimit(
  currentRate: number,
  targetRate: number,
  frameMs: number,
  tuning: RevealTuning,
  mode: RevealMode,
) {
  if (targetRate <= 0) {
    return 0;
  }
  if (currentRate <= 0) {
    return targetRate;
  }

  const settleMs = positiveOr(tuning.rateSettleMs[mode], 120);
  const baseRate = Math.max(currentRate, targetRate, 1 / Math.max(frameMs, 1));
  const maxStep = baseRate * clamp(frameMs / settleMs, 0.08, 0.5);

  if (targetRate > currentRate) {
    return Math.min(targetRate, currentRate + maxStep);
  }

  return Math.max(targetRate, currentRate - maxStep);
}

function getBudgetFrameMs(state: RevealControllerState) {
  return state.recoveryBudgetFramesRemaining > 0
    ? Math.min(state.frameMs, RECOVERY_BUDGET_FRAME_CAP_MS)
    : state.frameMs;
}

function getBudgetCapChars(
  state: RevealControllerState,
  rateCharsPerMs: number,
  mode: RevealMode,
  budgetFrameMs: number,
) {
  return Math.max(
    1,
    Math.ceil(
      Math.max(1, rateCharsPerMs * budgetFrameMs) * state.tuning.budgetBankFrames[mode],
    ),
  );
}

function getDeadlineStepFloorChars(
  state: RevealControllerState,
  backlogChars: number,
  at: number,
) {
  if (state.completionDeadlineAt == null) {
    return 0;
  }

  const remainingMs = Math.max(state.frameMs, state.completionDeadlineAt - at);
  const remainingFrames = Math.max(
    1,
    Math.ceil(remainingMs / Math.max(1, state.frameMs)),
  );

  return Math.ceil(backlogChars / remainingFrames);
}

function getEffectiveStepCapChars(
  state: RevealControllerState,
  mode: RevealMode,
  backlogChars: number,
  spendableChars: number,
  at: number,
  budgetFrameMs: number,
) {
  const baseStepChars = Math.max(1, state.tuning.maxStepChars[mode]);
  const rateDrivenStepChars = Math.max(
    baseStepChars,
    Math.ceil(
      Math.max(1, state.visibleRateCharsPerMs * budgetFrameMs) *
        state.tuning.stepRateMultipliers[mode],
    ),
  );
  const deadlineStepChars =
    mode === "complete"
      ? getDeadlineStepFloorChars(state, backlogChars, at)
      : 0;

  return Math.max(
    baseStepChars,
    Math.min(spendableChars, Math.max(rateDrivenStepChars, deadlineStepChars)),
  );
}

function updateSteadyReference(
  state: RevealControllerState,
  estimate: ArrivalEstimate,
  targetRate: number,
  mode: RevealMode,
) {
  if (mode === "complete") {
    return;
  }

  const referenceCandidate = clamp(
    targetRate,
    estimate.arrivalRateCharsPerMs * 0.85,
    estimate.arrivalRateCharsPerMs * state.tuning.steadyMaxRateFactor,
  );
  const alpha = mode === "steady" ? 0.18 : 0.08;
  state.steadyReferenceRateCharsPerMs = updateEma(
    positiveOr(state.steadyReferenceRateCharsPerMs, referenceCandidate),
    referenceCandidate,
    alpha,
  );
}

function resetDebugState(state: SoftLlmStreamDebugState) {
  state.mode = EMPTY_DEBUG_STATE.mode;
  state.arrivalRateCharsPerMs = EMPTY_DEBUG_STATE.arrivalRateCharsPerMs;
  state.predictedGapMs = EMPTY_DEBUG_STATE.predictedGapMs;
  state.jitterMs = EMPTY_DEBUG_STATE.jitterMs;
  state.hiddenBacklogChars = EMPTY_DEBUG_STATE.hiddenBacklogChars;
  state.hiddenBacklogHorizonMs = EMPTY_DEBUG_STATE.hiddenBacklogHorizonMs;
  state.reserveHorizonMs = EMPTY_DEBUG_STATE.reserveHorizonMs;
  state.targetHorizonMs = EMPTY_DEBUG_STATE.targetHorizonMs;
  state.maxHorizonMs = EMPTY_DEBUG_STATE.maxHorizonMs;
  state.visibleRateCharsPerMs = EMPTY_DEBUG_STATE.visibleRateCharsPerMs;
  state.revealBudgetChars = EMPTY_DEBUG_STATE.revealBudgetChars;
  state.isComplete = EMPTY_DEBUG_STATE.isComplete;
  state.sampleCount = EMPTY_DEBUG_STATE.sampleCount;
  return state;
}

function buildDebugState(
  state: RevealControllerState,
  mode: RevealMode,
  estimate: ArrivalEstimate,
  hiddenBacklogChars: number,
  hiddenBacklogHorizonMs: number,
  reserveHorizonMs: number,
  targetHorizonMs: number,
  maxHorizonMs: number,
): SoftLlmStreamDebugState {
  const next = state.debugState;
  next.mode = mode;
  next.arrivalRateCharsPerMs = estimate.arrivalRateCharsPerMs;
  next.predictedGapMs = estimate.predictedGapMs;
  next.jitterMs = estimate.jitterMs;
  next.hiddenBacklogChars = hiddenBacklogChars;
  next.hiddenBacklogHorizonMs = hiddenBacklogHorizonMs;
  next.reserveHorizonMs = reserveHorizonMs;
  next.targetHorizonMs = targetHorizonMs;
  next.maxHorizonMs = maxHorizonMs;
  next.visibleRateCharsPerMs = state.visibleRateCharsPerMs;
  next.revealBudgetChars = state.revealBudgetChars;
  next.isComplete = state.isComplete;
  next.sampleCount = estimate.sampleCount;
  return next;
}

export function createRevealController(options: {
  locale: string;
  tuning: RevealTuning;
}): RevealControllerState {
  return {
    locale: options.locale,
    tuning: options.tuning,
    arrival: createArrivalEstimator(),
    frameMs: DEFAULT_FRAME_MS,
    lastPaintAt: null,
    visibleRateCharsPerMs: 0,
    steadyReferenceRateCharsPerMs: 0,
    revealBudgetChars: 0,
    recoveryBudgetFramesRemaining: 0,
    preferBootstrapUntilDrain: false,
    mode: "bootstrap",
    isComplete: false,
    completionStartedAt: null,
    completionDeadlineAt: null,
    completionBaseRateCharsPerMs: 0,
    debugState: resetDebugState({ ...EMPTY_DEBUG_STATE }),
  };
}

export function resetRevealController(
  state: RevealControllerState,
  locale: string,
  tuning: RevealTuning,
) {
  state.locale = locale;
  state.tuning = tuning;
  resetArrivalEstimator(state.arrival);
  state.frameMs = DEFAULT_FRAME_MS;
  state.lastPaintAt = null;
  state.visibleRateCharsPerMs = 0;
  state.steadyReferenceRateCharsPerMs = 0;
  state.revealBudgetChars = 0;
  state.recoveryBudgetFramesRemaining = 0;
  state.preferBootstrapUntilDrain = false;
  state.mode = "bootstrap";
  state.isComplete = false;
  state.completionStartedAt = null;
  state.completionDeadlineAt = null;
  state.completionBaseRateCharsPerMs = 0;
  resetDebugState(state.debugState);
}

export function resetRevealClock(state: RevealControllerState) {
  state.lastPaintAt = null;
  state.revealBudgetChars = 0;
}

export function noteControllerChunk(
  state: RevealControllerState,
  chunkText: string,
  at: number,
  backlogWasEmpty = false,
) {
  if (backlogWasEmpty) {
    state.visibleRateCharsPerMs = 0;
  }

  state.recoveryBudgetFramesRemaining = backlogWasEmpty && chunkText.length > 0
    ? RECOVERY_BUDGET_CAP_FRAMES
    : state.recoveryBudgetFramesRemaining;
  state.preferBootstrapUntilDrain = backlogWasEmpty && chunkText.length > 0;
  noteArrival(state.arrival, chunkText, at, state.tuning);
  state.isComplete = false;
  state.completionStartedAt = null;
  state.completionDeadlineAt = null;
  state.completionBaseRateCharsPerMs = 0;
}

export function noteControllerComplete(
  state: RevealControllerState,
  at: number,
) {
  state.isComplete = true;
  state.completionStartedAt = null;
  state.completionDeadlineAt = null;
  state.completionBaseRateCharsPerMs = Math.max(
    state.completionBaseRateCharsPerMs,
    state.visibleRateCharsPerMs,
    state.steadyReferenceRateCharsPerMs,
  );
  if (state.lastPaintAt == null) {
    state.lastPaintAt = at;
  }
}

export function advanceReveal(
  state: RevealControllerState,
  params: {
    fullText: string;
    renderedLength: number;
    at: number;
    codeFenceState: CodeFenceState;
  },
): AdvanceRevealResult {
  updateFrameMs(state, params.at);

  const backlogChars = params.fullText.length - params.renderedLength;
  if (backlogChars <= 0) {
    state.preferBootstrapUntilDrain = false;
    state.recoveryBudgetFramesRemaining = 0;
    state.revealBudgetChars = 0;
    const estimate = getArrivalEstimate(state.arrival, state.frameMs, state.tuning);
    state.debugState = buildDebugState(
      state,
      state.isComplete ? "complete" : state.mode,
      estimate,
      0,
      0,
      0,
      0,
      0,
    );
    return {
      nextSliceEnd: params.renderedLength,
      debugState: state.debugState,
      suggestedDelayMs: 0,
    };
  }

  const estimate = getArrivalEstimate(state.arrival, state.frameMs, state.tuning);
  const reserveHorizonMs = getReserveHorizonMs(estimate, state.frameMs, state.tuning);
  const targetHorizonMs = getTargetHorizonMs(
    reserveHorizonMs,
    estimate,
    state.tuning,
  );
  const maxHorizonMs = getMaxHorizonMs(
    reserveHorizonMs,
    targetHorizonMs,
    state.tuning,
  );
  const backlogHorizonMs =
    backlogChars / Math.max(estimate.arrivalRateCharsPerMs, Number.EPSILON);
  const elapsedSinceChunkMs =
    state.arrival.lastChunkAt == null
      ? 0
      : Math.max(0, params.at - state.arrival.lastChunkAt);

  let nextMode: RevealMode;
  let targetRate: number;

  if (state.isComplete) {
    nextMode = "complete";
    targetRate = getCompletionRate(state, estimate, backlogChars, params.at);
  } else if (state.preferBootstrapUntilDrain) {
    nextMode = "bootstrap";
    targetRate = getBootstrapRate(state, backlogChars, estimate);
  } else if (estimate.sampleCount < 2) {
    nextMode = "bootstrap";
    targetRate = getBootstrapRate(state, backlogChars, estimate);
  } else if (
    backlogHorizonMs <= reserveHorizonMs * state.tuning.protectHorizonMultiplier ||
    elapsedSinceChunkMs >= estimate.predictedGapMs * 0.92
  ) {
    nextMode = "protect";
    targetRate = getProtectRate(
      state,
      estimate,
      backlogHorizonMs,
      reserveHorizonMs,
      elapsedSinceChunkMs,
    );
  } else if (backlogHorizonMs >= maxHorizonMs) {
    nextMode = "catchup";
    targetRate = getCatchupRate(
      state,
      estimate,
      backlogHorizonMs,
      targetHorizonMs,
    );
  } else {
    nextMode = "steady";
    targetRate = getSteadyRate(
      state,
      estimate,
      backlogHorizonMs,
      targetHorizonMs,
    );
  }

  const budgetFrameMs = getBudgetFrameMs(state);

  updateSteadyReference(state, estimate, targetRate, nextMode);
  state.visibleRateCharsPerMs = applySlewLimit(
    state.visibleRateCharsPerMs,
    targetRate,
    state.frameMs,
    state.tuning,
    nextMode,
  );
  state.mode = nextMode;
  state.revealBudgetChars = Math.min(
    state.revealBudgetChars + state.visibleRateCharsPerMs * budgetFrameMs,
    getBudgetCapChars(state, state.visibleRateCharsPerMs, nextMode, budgetFrameMs),
  );

  if (params.renderedLength === 0) {
    state.revealBudgetChars = Math.max(
      state.revealBudgetChars,
      state.tuning.firstPaintMinChars,
    );
  }

  const spendableChars = Math.max(0, Math.floor(state.revealBudgetChars));
  const stepCapChars = getEffectiveStepCapChars(
    state,
    nextMode,
    backlogChars,
    spendableChars,
    params.at,
    budgetFrameMs,
  );
  const maxChars = Math.max(
    1,
    Math.min(
      backlogChars,
      spendableChars,
      stepCapChars + state.tuning.boundaryOvershootChars[nextMode],
    ),
  );
  const preferredChars = Math.max(
    1,
    Math.min(backlogChars, spendableChars, stepCapChars),
  );
  const remaining = params.fullText.slice(
    params.renderedLength,
    params.renderedLength + Math.min(backlogChars, getSliceSearchWindowChars(maxChars)),
  );

  let consumedChars = 0;
  if (spendableChars > 0) {
    consumedChars = chooseSliceLength(remaining, preferredChars, {
      locale: state.locale,
      insideCodeFence: params.codeFenceState.open,
      maxChars,
      maxOvershootChars: state.tuning.boundaryOvershootChars[nextMode],
      preferBoundary: nextMode !== "protect",
    });
  }

  if (consumedChars > 0) {
    state.revealBudgetChars = Math.max(0, state.revealBudgetChars - consumedChars);
  }

  if (state.recoveryBudgetFramesRemaining > 0) {
    state.recoveryBudgetFramesRemaining -= 1;
  }

  state.debugState = buildDebugState(
    state,
    nextMode,
    estimate,
    backlogChars,
    backlogHorizonMs,
    reserveHorizonMs,
    targetHorizonMs,
    maxHorizonMs,
  );

  return {
    nextSliceEnd: params.renderedLength + Math.max(0, consumedChars),
    debugState: state.debugState,
    suggestedDelayMs: getSuggestedDelayMs(
      state,
      estimate,
      params.renderedLength + Math.max(0, consumedChars),
      params.fullText.length,
    ),
  };
}
