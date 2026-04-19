import type { RevealTuning } from "./core-types.js";
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
export declare function createArrivalEstimator(): ArrivalEstimatorState;
export declare function resetArrivalEstimator(state: ArrivalEstimatorState): void;
export declare function noteArrival(state: ArrivalEstimatorState, chunkText: string | number, at: number, tuning: RevealTuning): void;
export declare function getArrivalEstimate(state: ArrivalEstimatorState, frameMs: number, tuning: RevealTuning): ArrivalEstimate;
export {};
