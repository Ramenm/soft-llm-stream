import type {
  StreamSnapshot,
  StreamSource,
  StreamSourceInput,
} from "./core-types.js";
import { FRAME_SCHEDULER_TUNING } from "./reveal-tuning.js";

export const DEFAULT_FRAME_MS = FRAME_SCHEDULER_TUNING.defaultFrameMs;

export type SchedulerHandle =
  | { kind: "raf"; id: number }
  | { kind: "timeout"; id: ReturnType<typeof setTimeout> }
  | null;

export function now() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function positiveOr(
  value: number | null | undefined,
  fallback: number,
) {
  return Number.isFinite(value) && value != null && value > 0
    ? value
    : fallback;
}

export function updateEma(current: number, next: number, alpha: number) {
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
      .find(
        (candidate): candidate is string =>
          typeof candidate === "string" && candidate.trim().length > 0,
      )
      ?.trim();

    if (navigatorLocale) {
      return navigatorLocale;
    }
  }

  return "en";
}

export function resolveLocale(locale?: string) {
  const normalized = locale?.trim();
  return normalized || getDefaultLocale();
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value) &&
    typeof (value as PromiseLike<unknown>).then === "function";
}

export async function resolveSource(
  source: StreamSourceInput,
  signal: AbortSignal,
): Promise<StreamSource> {
  if (typeof source === "function") {
    const resolved = source(signal);
    return isPromiseLike(resolved)
      ? ((await resolved) as StreamSource)
      : resolved;
  }

  return isPromiseLike(source)
    ? ((await source) as StreamSource)
    : source;
}

export function isResponse(value: StreamSource): value is Response {
  return typeof Response !== "undefined" && value instanceof Response;
}

export function isReadableStreamString(
  value: StreamSource,
): value is ReadableStream<unknown> {
  return typeof ReadableStream !== "undefined" && value instanceof ReadableStream;
}

export function isAsyncIterableSource(
  value: StreamSource,
): value is AsyncIterable<unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      Symbol.asyncIterator in value &&
      typeof (value as AsyncIterable<Uint8Array | string>)[Symbol.asyncIterator] ===
        "function",
  );
}

export function cancelScheduler(handle: SchedulerHandle) {
  if (!handle) {
    return;
  }
  if (handle.kind === "raf" && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle.id);
    return;
  }
  clearTimeout(handle.id);
}

export function scheduleFrame(
  callback: (timestamp: number) => void,
  preferredDelayMs = 0,
  frameMsHint = DEFAULT_FRAME_MS,
): SchedulerHandle {
  const safeDelayMs = Math.max(0, preferredDelayMs);
  const resolvedFrameMs = positiveOr(frameMsHint, DEFAULT_FRAME_MS);

  if (
    safeDelayMs <=
      resolvedFrameMs * FRAME_SCHEDULER_TUNING.rafDelayMultiplier &&
    typeof requestAnimationFrame === "function" &&
    (typeof document === "undefined" || document.visibilityState === "visible")
  ) {
    return {
      kind: "raf",
      id: requestAnimationFrame((timestamp) => callback(timestamp)),
    };
  }

  return {
    kind: "timeout",
    id: setTimeout(
      () => callback(now()),
      Math.max(1, safeDelayMs || resolvedFrameMs),
    ),
  };
}

export function getDocumentVisibilityState():
  | DocumentVisibilityState
  | "visible" {
  if (typeof document === "undefined") {
    return "visible";
  }
  return document.visibilityState;
}

export function subscribeVisibilityChange(listener: () => void) {
  if (typeof document === "undefined") {
    return () => {};
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

  const scheduling = (navigator as Navigator & {
    scheduling?: { isInputPending?: () => boolean };
  }).scheduling;

  if (typeof scheduling?.isInputPending !== "function") {
    return false;
  }

  try {
    return scheduling.isInputPending();
  } catch {
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

export function isAbortError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      typeof (error as { name?: unknown }).name === "string" &&
      (error as { name: string }).name === "AbortError",
  );
}

export function updateSnapshot(
  snapshot: StreamSnapshot,
  patch: Partial<StreamSnapshot>,
): StreamSnapshot {
  const next = { ...snapshot, ...patch };
  next.hasBacklog = next.fullText.length > next.text.length;
  return next;
}
