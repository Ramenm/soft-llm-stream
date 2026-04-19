import type { RevealTuning, RevealTuningPresetName } from "./core-types.js";
export declare const FRAME_SCHEDULER_TUNING: {
    readonly defaultFrameMs: number;
    readonly rafDelayMultiplier: 1.5;
};
export declare const BOUNDARY_TUNING: {
    readonly codeFenceTailUnits: 2;
    readonly segmenterWindowFactor: 2;
    readonly segmenterWindowPaddingChars: 64;
    readonly punctuationWindowMinChars: 24;
    readonly punctuationBeforeRatio: 0.55;
    readonly whitespaceBeforeRatio: 0.5;
    readonly punctuationAfterRatio: 0.6;
    readonly whitespaceAfterRatio: 0.55;
    readonly beforeBoundarySlackChars: 2;
};
export declare const DEFAULT_REVEAL_TUNING: RevealTuning;
export declare const FAST_FIRST_REVEAL_TUNING: RevealTuning;
export declare const SOFT_FINISH_REVEAL_TUNING: RevealTuning;
export declare const REVEAL_TUNING_PRESETS: {
    readonly balanced: RevealTuning;
    readonly fastFirst: RevealTuning;
    readonly softFinish: RevealTuning;
};
export declare function resolveRevealTuningPreset(presetName?: RevealTuningPresetName): RevealTuning;
export declare function mergeRevealTuning(overrides?: Partial<RevealTuning>, presetName?: RevealTuningPresetName): RevealTuning;
