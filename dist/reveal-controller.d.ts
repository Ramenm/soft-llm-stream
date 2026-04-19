import type { RevealMode, RevealTuning, SoftLlmStreamDebugState } from "./core-types.js";
import type { CodeFenceState } from "./reveal-boundaries.js";
import { type ArrivalEstimatorState } from "./arrival-estimator.js";
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
export declare function createRevealController(options: {
    locale: string;
    tuning: RevealTuning;
}): RevealControllerState;
export declare function resetRevealController(state: RevealControllerState, locale: string, tuning: RevealTuning): void;
export declare function resetRevealClock(state: RevealControllerState): void;
export declare function noteControllerChunk(state: RevealControllerState, chunkText: string, at: number, backlogWasEmpty?: boolean): void;
export declare function noteControllerComplete(state: RevealControllerState, at: number): void;
export declare function advanceReveal(state: RevealControllerState, params: {
    fullText: string;
    renderedLength: number;
    at: number;
    codeFenceState: CodeFenceState;
}): AdvanceRevealResult;
