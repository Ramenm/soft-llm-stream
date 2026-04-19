export * from "./core-types.js";
export { adapters } from "./stream-adapters.js";
export { DEFAULT_REVEAL_TUNING, FAST_FIRST_REVEAL_TUNING, REVEAL_TUNING_PRESETS, SOFT_FINISH_REVEAL_TUNING, mergeRevealTuning, resolveRevealTuningPreset, } from "./reveal-tuning.js";
import { EMPTY_SNAPSHOT } from "./core-types.js";
import { cancelScheduler, createAbortError, getDocumentVisibilityState, hasPendingInput, isAbortError, now, prefersReducedMotion, resolveLocale, resolveSource, scheduleFrame, subscribeVisibilityChange, updateSnapshot, } from "./core-utils.js";
import { advanceCodeFenceState, createCodeFenceState, getCodeFenceState, } from "./reveal-boundaries.js";
import { advanceReveal, createRevealController, noteControllerChunk, noteControllerComplete, resetRevealClock, resetRevealController, } from "./reveal-controller.js";
import { mergeRevealTuning } from "./reveal-tuning.js";
import { prepareSourceAdapter } from "./stream-adapters.js";
export function createSoftLlmChatStream(options) {
    return createSoftLlmStream({
        ...options,
        adapter: options.adapter ?? "auto",
        hiddenPolicy: options.hiddenPolicy ?? "flush",
    });
}
export function createSoftLlmStream(options) {
    const listeners = new Set();
    let snapshot = { ...EMPTY_SNAPSHOT };
    let controller = null;
    let startPromise = null;
    let scheduled = null;
    let visibilityUnsubscribe = null;
    let lifecycleId = 0;
    let renderedCodeFenceState = createCodeFenceState();
    const locale = resolveLocale(options.locale);
    const tuning = mergeRevealTuning(options.debug?.tuning, options.revealProfile ?? "balanced");
    const revealController = createRevealController({
        locale,
        tuning,
    });
    const debugState = revealController.debugState;
    const shouldBypassReveal = () => options.reveal === false || prefersReducedMotion();
    const isLifecycleCurrent = (value) => lifecycleId === value;
    const emit = () => {
        for (const listener of listeners) {
            listener();
        }
    };
    const setSnapshot = (patch) => {
        const nextSnapshot = updateSnapshot(snapshot, patch);
        const didChange = nextSnapshot.status !== snapshot.status ||
            nextSnapshot.text !== snapshot.text ||
            nextSnapshot.fullText !== snapshot.fullText ||
            nextSnapshot.error !== snapshot.error ||
            nextSnapshot.meta !== snapshot.meta ||
            nextSnapshot.startedAt !== snapshot.startedAt ||
            nextSnapshot.completedAt !== snapshot.completedAt ||
            nextSnapshot.hasBacklog !== snapshot.hasBacklog;
        if (!didChange) {
            return;
        }
        snapshot = nextSnapshot;
        emit();
    };
    const setRenderedText = (nextText) => {
        if (nextText === snapshot.text) {
            return;
        }
        if (nextText.startsWith(snapshot.text)) {
            renderedCodeFenceState = advanceCodeFenceState(renderedCodeFenceState, nextText.slice(snapshot.text.length));
        }
        else {
            renderedCodeFenceState = getCodeFenceState(nextText);
        }
        setSnapshot({ text: nextText });
    };
    const appendRenderedText = (delta) => {
        if (!delta) {
            return;
        }
        renderedCodeFenceState = advanceCodeFenceState(renderedCodeFenceState, delta);
        setSnapshot({ text: snapshot.text + delta });
    };
    const cancelScheduled = () => {
        cancelScheduler(scheduled);
        scheduled = null;
    };
    const finalizeIfSettled = (runId = lifecycleId) => {
        if (!isLifecycleCurrent(runId)) {
            return;
        }
        if (snapshot.fullText.length === snapshot.text.length &&
            snapshot.status === "streaming" &&
            revealController.isComplete) {
            setSnapshot({ status: "done", completedAt: Date.now() });
        }
    };
    const flushVisibleText = (runId = lifecycleId) => {
        if (!isLifecycleCurrent(runId)) {
            return;
        }
        revealController.revealBudgetChars = 0;
        if (snapshot.text !== snapshot.fullText) {
            setRenderedText(snapshot.fullText);
        }
        finalizeIfSettled(runId);
    };
    const applyNextFullText = (runId, nextFullText, at) => {
        const nextStatus = snapshot.status === "connecting" ? "streaming" : snapshot.status;
        const shouldPrimeFirstPaint = snapshot.text.length === 0;
        setSnapshot({ fullText: nextFullText, status: nextStatus });
        if (shouldBypassReveal()) {
            setRenderedText(nextFullText);
            return;
        }
        if (shouldPrimeFirstPaint) {
            const result = runRevealStep(runId, at);
            if (result.hasBacklog) {
                scheduleNextReveal(runId, result.suggestedDelayMs, true);
            }
            return;
        }
        scheduleNextReveal(runId, 0, true);
    };
    const applyAppendedText = (runId, text, at) => {
        if (!text) {
            return;
        }
        const backlogWasEmpty = snapshot.fullText.length === snapshot.text.length;
        if (backlogWasEmpty) {
            resetRevealClock(revealController);
        }
        noteControllerChunk(revealController, text, at, backlogWasEmpty);
        applyNextFullText(runId, snapshot.fullText + text, at);
    };
    const syncReplacedText = (nextText) => {
        const nextStatus = snapshot.status === "connecting" ? "streaming" : snapshot.status;
        revealController.revealBudgetChars = 0;
        setSnapshot({ fullText: nextText, status: nextStatus });
        setRenderedText(nextText);
    };
    const applyReplacedText = (runId, nextText, at) => {
        if (nextText === snapshot.fullText) {
            return;
        }
        if (nextText.startsWith(snapshot.fullText)) {
            applyAppendedText(runId, nextText.slice(snapshot.fullText.length), at);
            return;
        }
        cancelScheduled();
        syncReplacedText(nextText);
        finalizeIfSettled(runId);
    };
    const runRevealStep = (runId, at) => {
        if (!isLifecycleCurrent(runId)) {
            return { hasBacklog: false, suggestedDelayMs: 0 };
        }
        if (shouldBypassReveal() || getDocumentVisibilityState() !== "visible") {
            flushVisibleText(runId);
            return { hasBacklog: false, suggestedDelayMs: 0 };
        }
        const result = advanceReveal(revealController, {
            fullText: snapshot.fullText,
            renderedLength: snapshot.text.length,
            at,
            codeFenceState: renderedCodeFenceState,
        });
        if (result.nextSliceEnd > snapshot.text.length) {
            appendRenderedText(snapshot.fullText.slice(snapshot.text.length, result.nextSliceEnd));
        }
        if (result.nextSliceEnd < snapshot.fullText.length) {
            return {
                hasBacklog: true,
                suggestedDelayMs: result.suggestedDelayMs,
            };
        }
        revealController.revealBudgetChars = 0;
        finalizeIfSettled(runId);
        return { hasBacklog: false, suggestedDelayMs: 0 };
    };
    const scheduleNextReveal = (runId, preferredDelayMs = 0, force = false) => {
        if (!isLifecycleCurrent(runId)) {
            return;
        }
        if (scheduled && !force) {
            return;
        }
        if (scheduled && force) {
            cancelScheduled();
        }
        if (shouldBypassReveal()) {
            flushVisibleText(runId);
            return;
        }
        if (getDocumentVisibilityState() !== "visible" &&
            options.hiddenPolicy !== "pause") {
            flushVisibleText(runId);
            return;
        }
        scheduled = scheduleFrame((timestamp) => {
            if (!isLifecycleCurrent(runId)) {
                return;
            }
            scheduled = null;
            if (shouldBypassReveal() || getDocumentVisibilityState() !== "visible") {
                flushVisibleText(runId);
                return;
            }
            if (snapshot.text.length > 0 &&
                !revealController.isComplete &&
                hasPendingInput()) {
                scheduleNextReveal(runId, revealController.frameMs);
                return;
            }
            const result = runRevealStep(runId, timestamp);
            if (result.hasBacklog) {
                scheduleNextReveal(runId, result.suggestedDelayMs);
            }
        }, preferredDelayMs, revealController.frameMs);
    };
    const resetInternal = () => {
        lifecycleId += 1;
        cancelScheduled();
        visibilityUnsubscribe?.();
        visibilityUnsubscribe = null;
        controller = null;
        startPromise = null;
        resetRevealController(revealController, locale, tuning);
        renderedCodeFenceState = createCodeFenceState();
        snapshot = { ...EMPTY_SNAPSHOT };
        emit();
    };
    const isTerminalSnapshot = (value) => value.status === "done" || value.status === "stopped" || value.status === "error";
    const waitForTerminalSnapshot = () => {
        if (isTerminalSnapshot(snapshot) &&
            (!snapshot.hasBacklog || snapshot.status !== "done")) {
            return Promise.resolve(snapshot);
        }
        return new Promise((resolve) => {
            const listener = () => {
                if (isTerminalSnapshot(snapshot) &&
                    (!snapshot.hasBacklog || snapshot.status !== "done")) {
                    listeners.delete(listener);
                    resolve(snapshot);
                }
            };
            listeners.add(listener);
        });
    };
    const stop = async () => {
        const runId = lifecycleId;
        const activeController = controller;
        const activeStartPromise = startPromise;
        cancelScheduled();
        if (activeController) {
            setSnapshot({ status: revealController.isComplete ? "done" : "stopping" });
            activeController.abort();
        }
        flushVisibleText(runId);
        if (isLifecycleCurrent(runId) && !revealController.isComplete) {
            setSnapshot({ status: "stopped", completedAt: Date.now() });
        }
        if (activeStartPromise) {
            try {
                await activeStartPromise;
            }
            catch {
                // caller can inspect store state
            }
        }
    };
    const start = async () => {
        if (startPromise) {
            return startPromise;
        }
        const runId = lifecycleId + 1;
        lifecycleId = runId;
        const runController = new AbortController();
        controller = runController;
        resetRevealController(revealController, locale, tuning);
        renderedCodeFenceState = createCodeFenceState();
        setSnapshot({
            status: "connecting",
            text: "",
            fullText: "",
            error: null,
            meta: {},
            startedAt: Date.now(),
            completedAt: null,
        });
        visibilityUnsubscribe?.();
        const unsubscribeVisibility = subscribeVisibilityChange(() => {
            if (!isLifecycleCurrent(runId)) {
                return;
            }
            if (getDocumentVisibilityState() === "visible") {
                if (snapshot.text.length < snapshot.fullText.length) {
                    scheduleNextReveal(runId, 0, true);
                }
                return;
            }
            if (options.hiddenPolicy !== "pause") {
                flushVisibleText(runId);
            }
        });
        visibilityUnsubscribe = unsubscribeVisibility;
        const run = async () => {
            try {
                const resolvedSource = await resolveSource(options.source, runController.signal);
                if (!isLifecycleCurrent(runId)) {
                    return snapshot;
                }
                const { source: preparedSource, adapter } = await prepareSourceAdapter(resolvedSource, options.adapter, runController.signal);
                for await (const event of adapter.consume(preparedSource, {
                    signal: runController.signal,
                })) {
                    if (!isLifecycleCurrent(runId)) {
                        throw createAbortError();
                    }
                    options.onEvent?.(event);
                    if (event.type === "text") {
                        applyAppendedText(runId, event.text, now());
                        continue;
                    }
                    if (event.type === "replace") {
                        applyReplacedText(runId, event.text, now());
                        continue;
                    }
                    if (event.type === "meta") {
                        setSnapshot({ meta: { ...snapshot.meta, ...event.data } });
                        continue;
                    }
                    if (event.type === "error") {
                        throw event.error;
                    }
                    if (event.type === "done") {
                        noteControllerComplete(revealController, now());
                        if (shouldBypassReveal()) {
                            setSnapshot({
                                text: snapshot.fullText,
                                status: "done",
                                completedAt: Date.now(),
                            });
                        }
                        else if (snapshot.text.length < snapshot.fullText.length) {
                            scheduleNextReveal(runId, 0, true);
                        }
                        else {
                            setSnapshot({ status: "done", completedAt: Date.now() });
                        }
                    }
                }
                if (!isLifecycleCurrent(runId)) {
                    return snapshot;
                }
                if (controller !== runController) {
                    return snapshot;
                }
                noteControllerComplete(revealController, now());
                if (snapshot.status !== "done" && snapshot.status !== "stopped") {
                    if (snapshot.text.length < snapshot.fullText.length) {
                        scheduleNextReveal(runId, 0, true);
                    }
                    else {
                        setSnapshot({ status: "done", completedAt: Date.now() });
                    }
                }
                return snapshot;
            }
            catch (error) {
                if (!isLifecycleCurrent(runId)) {
                    return snapshot;
                }
                if (isAbortError(error) || runController.signal.aborted) {
                    flushVisibleText(runId);
                    if (!revealController.isComplete) {
                        setSnapshot({ status: "stopped", completedAt: Date.now() });
                    }
                    return waitForTerminalSnapshot();
                }
                flushVisibleText(runId);
                setSnapshot({ status: "error", error, completedAt: Date.now() });
                throw error;
            }
            finally {
                unsubscribeVisibility();
                if (isLifecycleCurrent(runId)) {
                    controller = null;
                    if (revealController.isComplete &&
                        snapshot.text.length < snapshot.fullText.length &&
                        !shouldBypassReveal()) {
                        scheduleNextReveal(runId, 0, true);
                    }
                    else {
                        finalizeIfSettled(runId);
                    }
                    if (visibilityUnsubscribe === unsubscribeVisibility) {
                        visibilityUnsubscribe = null;
                    }
                    startPromise = null;
                }
            }
        };
        const currentStartPromise = run().then(async (currentSnapshot) => {
            if (!isLifecycleCurrent(runId)) {
                return snapshot;
            }
            if (isTerminalSnapshot(currentSnapshot) &&
                (!currentSnapshot.hasBacklog || currentSnapshot.status !== "done")) {
                return currentSnapshot;
            }
            return waitForTerminalSnapshot();
        });
        startPromise = currentStartPromise;
        return currentStartPromise;
    };
    const store = {
        kind: "ramenm-soft-llm-stream",
        getSnapshot: () => snapshot,
        getDebugState: () => debugState,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        start,
        stop,
        reset() {
            void stop();
            resetInternal();
        },
    };
    if (options.autoStart) {
        queueMicrotask(() => {
            void store.start().catch(() => {
                // caller can inspect store state
            });
        });
    }
    return store;
}
