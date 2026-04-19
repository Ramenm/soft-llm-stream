import { type RevealMode, type RevealTuning } from "./core-types.js";
export type TraceEvent = {
    delayMs: number;
    text: string;
};
export type TraceFixture = {
    name: string;
    description?: string;
    text?: string;
    events: TraceEvent[];
};
export type TraceSimulationSample = {
    timestampMs: number;
    visibleChars: number;
    fullChars: number;
    hiddenChars: number;
    hiddenBacklogHorizonMs: number;
    reserveHorizonMs: number;
    targetHorizonMs: number;
    maxHorizonMs: number;
    visibleRateCharsPerMs: number;
    mode: RevealMode;
};
export type TraceVisibleTimelineEntry = {
    timestampMs: number;
    visibleChars: number;
};
export type TraceFullTimelineEntry = {
    timestampMs: number;
    fullChars: number;
};
export type TraceSimulationResult = {
    traceName: string;
    trace: TraceFixture;
    finalText: string;
    samples: TraceSimulationSample[];
    visibleTimeline: TraceVisibleTimelineEntry[];
    fullTextTimeline: TraceFullTimelineEntry[];
};
export declare function simulateTrace(options: {
    trace: TraceFixture;
    frameMs?: number;
    locale?: string;
    tuning?: Partial<RevealTuning>;
}): TraceSimulationResult;
