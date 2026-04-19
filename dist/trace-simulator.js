import { EMPTY_DEBUG_STATE, } from "./core-types.js";
import { advanceCodeFenceState, createCodeFenceState, } from "./reveal-boundaries.js";
import { advanceReveal, createRevealController, noteControllerChunk, noteControllerComplete, resetRevealClock, } from "./reveal-controller.js";
import { DEFAULT_FRAME_MS } from "./core-utils.js";
import { mergeRevealTuning } from "./reveal-tuning.js";
export function simulateTrace(options) {
    const trace = options.trace;
    const frameMs = options.frameMs ?? DEFAULT_FRAME_MS;
    const locale = options.locale ?? "en";
    const tuning = mergeRevealTuning(options.tuning);
    const controller = createRevealController({ locale, tuning });
    let eventTimeMs = 0;
    const events = trace.events.map((event, index) => {
        eventTimeMs += Math.max(0, Number(event.delayMs) || 0);
        return {
            index,
            timeMs: eventTimeMs,
            text: String(event.text ?? ""),
        };
    });
    const samples = [];
    const visibleTimeline = [
        { timestampMs: 0, visibleChars: 0 },
    ];
    const fullTextTimeline = [
        { timestampMs: 0, fullChars: 0 },
    ];
    let fullText = "";
    let visibleText = "";
    let debugState = { ...EMPTY_DEBUG_STATE };
    let codeFenceState = createCodeFenceState();
    let nextEventIndex = 0;
    let nextFrameAt = 0;
    let isMarkedComplete = false;
    const capture = (timestampMs) => {
        samples.push({
            timestampMs,
            visibleChars: visibleText.length,
            fullChars: fullText.length,
            hiddenChars: fullText.length - visibleText.length,
            hiddenBacklogHorizonMs: debugState.hiddenBacklogHorizonMs,
            reserveHorizonMs: debugState.reserveHorizonMs,
            targetHorizonMs: debugState.targetHorizonMs,
            maxHorizonMs: debugState.maxHorizonMs,
            visibleRateCharsPerMs: debugState.visibleRateCharsPerMs,
            mode: debugState.mode,
        });
    };
    capture(0);
    const finalEventTimeMs = events.length > 0 ? events[events.length - 1].timeMs : 0;
    while (nextEventIndex < events.length ||
        visibleText.length < fullText.length ||
        !isMarkedComplete) {
        const nextEvent = events[nextEventIndex];
        const nextEventAt = nextEvent ? nextEvent.timeMs : Number.POSITIVE_INFINITY;
        if (visibleText.length >= fullText.length &&
            !isMarkedComplete &&
            nextEvent &&
            nextFrameAt < nextEventAt) {
            nextFrameAt = nextEventAt;
        }
        const nextActionAt = Math.min(nextFrameAt, nextEventAt);
        if (nextActionAt === Number.POSITIVE_INFINITY) {
            break;
        }
        if (nextEvent && nextEventAt <= nextFrameAt) {
            const backlogWasEmpty = visibleText.length >= fullText.length;
            if (backlogWasEmpty) {
                resetRevealClock(controller);
            }
            fullText += nextEvent.text;
            fullTextTimeline.push({
                timestampMs: nextEventAt,
                fullChars: fullText.length,
            });
            noteControllerChunk(controller, nextEvent.text, nextEventAt, backlogWasEmpty);
            nextEventIndex += 1;
            if (nextEventIndex >= events.length &&
                !isMarkedComplete &&
                finalEventTimeMs <= nextFrameAt) {
                noteControllerComplete(controller, finalEventTimeMs);
                isMarkedComplete = true;
            }
            if (nextEventAt < nextFrameAt) {
                continue;
            }
        }
        if (!isMarkedComplete && nextFrameAt >= finalEventTimeMs && nextEventIndex >= events.length) {
            noteControllerComplete(controller, nextFrameAt);
            isMarkedComplete = true;
        }
        const result = advanceReveal(controller, {
            fullText,
            renderedLength: visibleText.length,
            at: nextFrameAt,
            codeFenceState,
        });
        debugState = result.debugState;
        if (result.nextSliceEnd > visibleText.length) {
            const nextText = fullText.slice(0, result.nextSliceEnd);
            codeFenceState = advanceCodeFenceState(codeFenceState, nextText.slice(visibleText.length));
            visibleText = nextText;
            visibleTimeline.push({
                timestampMs: nextFrameAt,
                visibleChars: visibleText.length,
            });
        }
        capture(nextFrameAt);
        nextFrameAt += frameMs;
        if (nextEventIndex >= events.length &&
            isMarkedComplete &&
            visibleText.length >= fullText.length &&
            nextFrameAt > finalEventTimeMs + frameMs) {
            break;
        }
    }
    return {
        traceName: trace.name,
        trace,
        finalText: visibleText,
        samples,
        visibleTimeline,
        fullTextTimeline,
    };
}
