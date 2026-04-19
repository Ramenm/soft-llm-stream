import { FRAME_SCHEDULER_TUNING } from "./reveal-tuning.js";
export const DEFAULT_FRAME_MS = FRAME_SCHEDULER_TUNING.defaultFrameMs;
export function now() {
    return typeof performance !== "undefined" &&
        typeof performance.now === "function"
        ? performance.now()
        : Date.now();
}
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
export function positiveOr(value, fallback) {
    return Number.isFinite(value) && value != null && value > 0
        ? value
        : fallback;
}
export function updateEma(current, next, alpha) {
    if (!Number.isFinite(current) || current <= 0) {
        return next;
    }
    return current + (next - current) * clamp(alpha, 0, 1);
}
function getDefaultLocale() {
    if (typeof document !== "undefined") {
        const documentLocale = document.documentElement?.lang?.trim();
        if (documentLocale) {
            return documentLocale;
        }
    }
    if (typeof navigator !== "undefined") {
        const navigatorLocale = [navigator.language, ...(navigator.languages ?? [])]
            .find((candidate) => typeof candidate === "string" && candidate.trim().length > 0)
            ?.trim();
        if (navigatorLocale) {
            return navigatorLocale;
        }
    }
    return "en";
}
export function resolveLocale(locale) {
    const normalized = locale?.trim();
    return normalized || getDefaultLocale();
}
function isPromiseLike(value) {
    return Boolean(value) &&
        typeof value.then === "function";
}
export async function resolveSource(source, signal) {
    if (typeof source === "function") {
        const resolved = source(signal);
        return isPromiseLike(resolved)
            ? (await resolved)
            : resolved;
    }
    return isPromiseLike(source)
        ? (await source)
        : source;
}
export function isResponse(value) {
    return typeof Response !== "undefined" && value instanceof Response;
}
export function isReadableStreamString(value) {
    return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
}
export function isAsyncIterableSource(value) {
    return Boolean(value &&
        typeof value === "object" &&
        Symbol.asyncIterator in value &&
        typeof value[Symbol.asyncIterator] ===
            "function");
}
export function cancelScheduler(handle) {
    if (!handle) {
        return;
    }
    if (handle.kind === "raf" && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(handle.id);
        return;
    }
    clearTimeout(handle.id);
}
export function scheduleFrame(callback, preferredDelayMs = 0, frameMsHint = DEFAULT_FRAME_MS) {
    const safeDelayMs = Math.max(0, preferredDelayMs);
    const resolvedFrameMs = positiveOr(frameMsHint, DEFAULT_FRAME_MS);
    if (safeDelayMs <=
        resolvedFrameMs * FRAME_SCHEDULER_TUNING.rafDelayMultiplier &&
        typeof requestAnimationFrame === "function" &&
        (typeof document === "undefined" || document.visibilityState === "visible")) {
        return {
            kind: "raf",
            id: requestAnimationFrame((timestamp) => callback(timestamp)),
        };
    }
    return {
        kind: "timeout",
        id: setTimeout(() => callback(now()), Math.max(1, safeDelayMs || resolvedFrameMs)),
    };
}
export function getDocumentVisibilityState() {
    if (typeof document === "undefined") {
        return "visible";
    }
    return document.visibilityState;
}
export function subscribeVisibilityChange(listener) {
    if (typeof document === "undefined") {
        return () => { };
    }
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
}
export function prefersReducedMotion() {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
        return false;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
export function hasPendingInput() {
    if (typeof navigator === "undefined") {
        return false;
    }
    const scheduling = navigator.scheduling;
    if (typeof scheduling?.isInputPending !== "function") {
        return false;
    }
    try {
        return scheduling.isInputPending();
    }
    catch {
        return false;
    }
}
export function createAbortError() {
    if (typeof DOMException !== "undefined") {
        return new DOMException("The operation was aborted.", "AbortError");
    }
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    return error;
}
export function isAbortError(error) {
    return Boolean(error &&
        typeof error === "object" &&
        "name" in error &&
        typeof error.name === "string" &&
        error.name === "AbortError");
}
export function updateSnapshot(snapshot, patch) {
    const next = { ...snapshot, ...patch };
    next.hasBacklog = next.fullText.length > next.text.length;
    return next;
}
