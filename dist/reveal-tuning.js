export const FRAME_SCHEDULER_TUNING = {
    defaultFrameMs: 1000 / 60,
    rafDelayMultiplier: 1.5,
};
export const BOUNDARY_TUNING = {
    codeFenceTailUnits: 2,
    segmenterWindowFactor: 2,
    segmenterWindowPaddingChars: 64,
    punctuationWindowMinChars: 24,
    punctuationBeforeRatio: 0.55,
    whitespaceBeforeRatio: 0.5,
    punctuationAfterRatio: 0.6,
    whitespaceAfterRatio: 0.55,
    beforeBoundarySlackChars: 2,
};
export const DEFAULT_REVEAL_TUNING = {
    estimatorWindowSize: 12,
    bootstrapDefaultGapMs: 120,
    bootstrapSeedLookaheadMs: 120,
    bootstrapMinRateCharsPerMs: 1 / 70,
    bootstrapMaxRateCharsPerMs: 0.18,
    firstPaintMinChars: 1,
    estimatedRateMaxCharsPerMs: 1.2,
    gapJitterMultiplier: 0.85,
    reserveMinFrames: 2.23,
    reserveMaxMs: 285,
    reserveJitterWeight: 0.21,
    targetExtraMs: 110,
    targetMaxMs: 297,
    protectHorizonMultiplier: 0.97,
    catchupHorizonMultiplier: 2.48,
    steadyControlGain: 0.39,
    steadyMinRateFactor: 0.86,
    steadyMaxRateFactor: 1.25,
    protectMinRateFactor: 0.57,
    protectRecoveryExponent: 0.62,
    catchupMaxRateFactor: 1.16,
    completeBaseFloorFactor: 0.98,
    completeMaxRateFactor: 1.35,
    completeMinDurationMs: 96,
    completeMaxDurationMs: 260,
    rateSettleMs: {
        bootstrap: 90,
        steady: 238,
        protect: 220,
        catchup: 215,
        complete: 133,
    },
    budgetBankFrames: {
        bootstrap: 1.8,
        steady: 4.4,
        protect: 2.67,
        catchup: 3.16,
        complete: 3.11,
    },
    maxStepChars: {
        bootstrap: 2,
        steady: 1,
        protect: 1,
        catchup: 2,
        complete: 1,
    },
    stepRateMultipliers: {
        bootstrap: 1.2,
        steady: 1.2,
        protect: 1.05,
        catchup: 1.6,
        complete: 1.4,
    },
    boundaryOvershootChars: {
        bootstrap: 1,
        steady: 0,
        protect: 0,
        catchup: 1,
        complete: 0,
    },
};
export const FAST_FIRST_REVEAL_TUNING = {
    ...DEFAULT_REVEAL_TUNING,
    reserveMinFrames: 1.85,
    reserveMaxMs: 240,
    targetExtraMs: 82,
    targetMaxMs: 268,
    steadyMaxRateFactor: 1.3,
    catchupMaxRateFactor: 1.24,
    completeMaxDurationMs: 220,
    budgetBankFrames: {
        ...DEFAULT_REVEAL_TUNING.budgetBankFrames,
        steady: 3.4,
        catchup: 2.8,
        complete: 2.7,
    },
    stepRateMultipliers: {
        ...DEFAULT_REVEAL_TUNING.stepRateMultipliers,
        steady: 1.3,
        catchup: 1.8,
        complete: 1.35,
    },
};
export const SOFT_FINISH_REVEAL_TUNING = {
    ...DEFAULT_REVEAL_TUNING,
    reserveMinFrames: 2.4,
    reserveMaxMs: 310,
    targetExtraMs: 124,
    targetMaxMs: 330,
    completeMaxRateFactor: 1.24,
    completeMaxDurationMs: 320,
    budgetBankFrames: {
        ...DEFAULT_REVEAL_TUNING.budgetBankFrames,
        steady: 4.7,
        protect: 3.0,
        catchup: 3.2,
        complete: 3.4,
    },
    stepRateMultipliers: {
        ...DEFAULT_REVEAL_TUNING.stepRateMultipliers,
        steady: 1.1,
        catchup: 1.45,
        complete: 1.15,
    },
};
export const REVEAL_TUNING_PRESETS = {
    balanced: DEFAULT_REVEAL_TUNING,
    fastFirst: FAST_FIRST_REVEAL_TUNING,
    softFinish: SOFT_FINISH_REVEAL_TUNING,
};
export function resolveRevealTuningPreset(presetName = "balanced") {
    return REVEAL_TUNING_PRESETS[presetName] ?? DEFAULT_REVEAL_TUNING;
}
function mergeModeMap(current, patch) {
    if (!patch) {
        return current;
    }
    return {
        bootstrap: patch.bootstrap ?? current.bootstrap,
        steady: patch.steady ?? current.steady,
        protect: patch.protect ?? current.protect,
        catchup: patch.catchup ?? current.catchup,
        complete: patch.complete ?? current.complete,
    };
}
export function mergeRevealTuning(overrides, presetName = "balanced") {
    const baseTuning = resolveRevealTuningPreset(presetName);
    if (!overrides) {
        return baseTuning;
    }
    return {
        ...baseTuning,
        ...overrides,
        rateSettleMs: mergeModeMap(baseTuning.rateSettleMs, overrides.rateSettleMs),
        budgetBankFrames: mergeModeMap(baseTuning.budgetBankFrames, overrides.budgetBankFrames),
        maxStepChars: mergeModeMap(baseTuning.maxStepChars, overrides.maxStepChars),
        stepRateMultipliers: mergeModeMap(baseTuning.stepRateMultipliers, overrides.stepRateMultipliers),
        boundaryOvershootChars: mergeModeMap(baseTuning.boundaryOvershootChars, overrides.boundaryOvershootChars),
    };
}
