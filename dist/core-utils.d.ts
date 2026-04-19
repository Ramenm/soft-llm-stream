import type { StreamSnapshot, StreamSource, StreamSourceInput } from "./core-types.js";
export declare const DEFAULT_FRAME_MS: number;
export type SchedulerHandle = {
    kind: "raf";
    id: number;
} | {
    kind: "timeout";
    id: ReturnType<typeof setTimeout>;
} | null;
export declare function now(): number;
export declare function clamp(value: number, min: number, max: number): number;
export declare function positiveOr(value: number | null | undefined, fallback: number): number;
export declare function updateEma(current: number, next: number, alpha: number): number;
export declare function resolveLocale(locale?: string): string;
export declare function resolveSource(source: StreamSourceInput, signal: AbortSignal): Promise<StreamSource>;
export declare function isResponse(value: StreamSource): value is Response;
export declare function isReadableStreamString(value: StreamSource): value is ReadableStream<unknown>;
export declare function isAsyncIterableSource(value: StreamSource): value is AsyncIterable<unknown>;
export declare function cancelScheduler(handle: SchedulerHandle): void;
export declare function scheduleFrame(callback: (timestamp: number) => void, preferredDelayMs?: number, frameMsHint?: number): SchedulerHandle;
export declare function getDocumentVisibilityState(): DocumentVisibilityState | "visible";
export declare function subscribeVisibilityChange(listener: () => void): () => void;
export declare function prefersReducedMotion(): boolean;
export declare function hasPendingInput(): boolean;
export declare function createAbortError(): DOMException | Error;
export declare function isAbortError(error: unknown): boolean;
export declare function updateSnapshot(snapshot: StreamSnapshot, patch: Partial<StreamSnapshot>): StreamSnapshot;
