import { clamp, resolveLocale } from "./core-utils.js";
import { BOUNDARY_TUNING } from "./reveal-tuning.js";

const DENSE_SCRIPT_RE = /^(ja|zh|ko)\b/i;
const COMPLEX_BOUNDARY_RE = /[\p{M}\u200c\u200d\ufe0e\ufe0f]/u;
const EMOJI_MODIFIER_RE = /[\u{1f3fb}-\u{1f3ff}]/u;
const SEGMENTER_CACHE = new Map<string, SegmenterLike | null>();

type SegmentGranularity = "word" | "grapheme";
type SegmentLike = { segment: string };
type SegmenterLike = {
  segment: (input: string) => Iterable<SegmentLike>;
};

export type CodeFenceState = {
  open: boolean;
  tail: string;
};

export type SliceSelectionOptions = {
  locale: string;
  insideCodeFence: boolean;
  maxChars: number;
  maxOvershootChars: number;
  preferBoundary?: boolean;
};

export function createCodeFenceState(): CodeFenceState {
  return { open: false, tail: "" };
}

export function advanceCodeFenceState(
  state: CodeFenceState,
  appendedText: string,
): CodeFenceState {
  if (!appendedText) {
    return state;
  }

  const combined = `${state.tail}${appendedText}`;
  const fenceMatches = combined.match(/```/g);

  return {
    open: fenceMatches && fenceMatches.length % 2 === 1 ? !state.open : state.open,
    tail: combined.slice(-BOUNDARY_TUNING.codeFenceTailUnits),
  };
}

export function getCodeFenceState(text: string): CodeFenceState {
  return advanceCodeFenceState(createCodeFenceState(), text);
}

function getSegmenter(locale: string, granularity: SegmentGranularity) {
  const cacheKey = `${granularity}:${resolveLocale(locale).toLowerCase()}`;
  if (SEGMENTER_CACHE.has(cacheKey)) {
    return SEGMENTER_CACHE.get(cacheKey) ?? null;
  }

  const SegmenterCtor =
    typeof Intl === "undefined"
      ? undefined
      : (Intl as typeof Intl & {
          Segmenter?: new (
            locales?: string | string[],
            options?: { granularity: SegmentGranularity | "sentence" },
          ) => SegmenterLike;
        }).Segmenter;

  if (typeof SegmenterCtor !== "function") {
    SEGMENTER_CACHE.set(cacheKey, null);
    return null;
  }

  try {
    const segmenter = new SegmenterCtor(resolveLocale(locale), { granularity });
    SEGMENTER_CACHE.set(cacheKey, segmenter);
    return segmenter;
  } catch {
    SEGMENTER_CACHE.set(cacheKey, null);
    return null;
  }
}

function findCodePointBoundary(text: string, targetLength: number) {
  if (!text) {
    return 0;
  }
  if (text.length <= targetLength) {
    return text.length;
  }

  let consumedUnits = 0;
  for (const symbol of text) {
    consumedUnits += symbol.length;
    if (consumedUnits >= targetLength) {
      return consumedUnits;
    }
  }

  return text.length;
}

function isSimpleGraphemeBoundary(text: string, targetLength: number) {
  if (targetLength <= 0 || targetLength >= text.length) {
    return true;
  }

  const previous = text.charCodeAt(targetLength - 1);
  const next = text.charCodeAt(targetLength);

  if (
    (previous >= 0xd800 && previous <= 0xdbff) ||
    (next >= 0xdc00 && next <= 0xdfff)
  ) {
    return false;
  }

  const windowStart = Math.max(0, targetLength - 2);
  const windowEnd = Math.min(text.length, targetLength + 4);
  const boundaryWindow = text.slice(windowStart, windowEnd);

  return !(
    COMPLEX_BOUNDARY_RE.test(boundaryWindow) ||
    EMOJI_MODIFIER_RE.test(boundaryWindow)
  );
}

function findLooseSegmentBoundary(
  text: string,
  targetLength: number,
  direction: "after" | "before",
) {
  const searchWindow = text.slice(
    0,
    Math.min(
      text.length,
      Math.max(
        targetLength * BOUNDARY_TUNING.segmenterWindowFactor,
        BOUNDARY_TUNING.punctuationWindowMinChars,
      ),
    ),
  );
  const punctuation = [...searchWindow.matchAll(/[\s.,!?;:)](?=\s|$)/g)];

  if (direction === "before") {
    const punctuationBoundary = [...punctuation]
      .reverse()
      .find((part) => part.index != null && part.index + 1 <= targetLength);

    if (
      punctuationBoundary?.index != null &&
      punctuationBoundary.index + 1 >=
        Math.floor(targetLength * BOUNDARY_TUNING.punctuationBeforeRatio)
    ) {
      return punctuationBoundary.index + 1;
    }

    const whitespace = searchWindow.lastIndexOf(" ", targetLength);
    if (
      whitespace >=
        Math.floor(targetLength * BOUNDARY_TUNING.whitespaceBeforeRatio)
    ) {
      return whitespace + 1;
    }

    return 0;
  }

  const punctuationBoundary = punctuation.find(
    (part) => part.index != null && part.index + 1 >= targetLength,
  );

  if (
    punctuationBoundary?.index != null &&
    punctuationBoundary.index + 1 <=
      targetLength + BOUNDARY_TUNING.beforeBoundarySlackChars + 3
  ) {
    return punctuationBoundary.index + 1;
  }

  const whitespace = searchWindow.indexOf(" ", targetLength);
  if (
    whitespace >= 0 &&
    whitespace <= targetLength + BOUNDARY_TUNING.beforeBoundarySlackChars + 3
  ) {
    return whitespace + 1;
  }

  return 0;
}

export function findGraphemeBoundary(
  text: string,
  targetLength: number,
  locale: string,
) {
  if (!text) {
    return 0;
  }
  if (text.length <= targetLength) {
    return text.length;
  }

  if (isSimpleGraphemeBoundary(text, targetLength)) {
    return targetLength;
  }

  const segmenter = getSegmenter(locale, "grapheme");
  if (segmenter) {
    let consumed = 0;
    const segmentWindow = text.slice(
      0,
      Math.min(
        text.length,
        Math.max(
          targetLength + BOUNDARY_TUNING.segmenterWindowPaddingChars,
          Math.max(targetLength * 2, targetLength + 8),
        ),
      ),
    );

    for (const part of segmenter.segment(segmentWindow)) {
      consumed += part.segment.length;
      if (consumed >= targetLength) {
        return consumed;
      }
    }

    return segmentWindow.length >= text.length
      ? text.length
      : findCodePointBoundary(text, targetLength);
  }

  return findCodePointBoundary(text, targetLength);
}

function findLineBoundary(
  text: string,
  targetLength: number,
  direction: "after" | "before" = "after",
) {
  if (text.length <= targetLength) {
    return text.length;
  }

  if (direction === "before") {
    const end = text.lastIndexOf("\n", Math.max(0, targetLength - 1));
    return end === -1 ? 0 : end + 1;
  }

  const end = text.indexOf("\n", Math.max(0, targetLength - 1));
  if (end === -1) {
    return Math.min(text.length, targetLength);
  }
  return end + 1;
}

function findSegmentBoundary(
  text: string,
  targetLength: number,
  locale: string,
  direction: "after" | "before" = "after",
) {
  if (!text) {
    return 0;
  }
  if (text.length <= targetLength) {
    return text.length;
  }

  const denseScript = DENSE_SCRIPT_RE.test(locale);
  if (!denseScript) {
    const looseBoundary = findLooseSegmentBoundary(text, targetLength, direction);
    if (looseBoundary > 0) {
      return looseBoundary;
    }
  }

  const segmenter = getSegmenter(locale, "word");
  if (segmenter) {
    const segmentWindow = text.slice(
      0,
      Math.min(
        text.length,
        Math.max(
          targetLength * BOUNDARY_TUNING.segmenterWindowFactor,
          targetLength + BOUNDARY_TUNING.segmenterWindowPaddingChars,
        ),
      ),
    );
    let consumed = 0;
    let previousBoundary = 0;

    for (const part of segmenter.segment(segmentWindow)) {
      consumed += part.segment.length;

      if (consumed === targetLength) {
        return consumed;
      }

      if (consumed > targetLength) {
        if (direction === "before" && previousBoundary > 0) {
          return previousBoundary;
        }
        return consumed;
      }

      previousBoundary = consumed;
    }

    return segmentWindow.length >= text.length
      ? text.length
      : findGraphemeBoundary(text, targetLength, locale);
  }

  return findGraphemeBoundary(text, targetLength, locale);
}


export function getSliceSearchWindowChars(maxChars: number) {
  const safeMaxChars = Math.max(1, maxChars);
  return Math.max(
    BOUNDARY_TUNING.punctuationWindowMinChars,
    Math.ceil(safeMaxChars * BOUNDARY_TUNING.segmenterWindowFactor),
    safeMaxChars + BOUNDARY_TUNING.segmenterWindowPaddingChars,
  );
}

export function chooseSliceLength(
  remaining: string,
  preferredChars: number,
  options: SliceSelectionOptions,
) {
  if (preferredChars <= 0 || options.maxChars <= 0) {
    return 0;
  }

  const requestedMaxChars = Math.max(
    1,
    Math.min(options.maxChars, remaining.length),
  );
  const preferred = Math.max(1, Math.min(preferredChars, requestedMaxChars));
  const exactBoundary = findGraphemeBoundary(remaining, preferred, options.locale);
  const hardLimit = Math.max(requestedMaxChars, exactBoundary);

  if (exactBoundary >= remaining.length) {
    return remaining.length;
  }

  if ((options.preferBoundary ?? true) === false) {
    return Math.min(exactBoundary, hardLimit);
  }

  const overshootBudget = Math.max(
    0,
    Math.min(options.maxOvershootChars, hardLimit - exactBoundary),
  );

  if (!options.insideCodeFence && overshootBudget <= 0 && preferred <= 2) {
    return Math.min(exactBoundary, hardLimit);
  }

  if (overshootBudget > 0) {
    const afterBoundary = options.insideCodeFence
      ? findLineBoundary(remaining, preferred, "after")
      : findSegmentBoundary(remaining, preferred, options.locale, "after");

    if (
      afterBoundary > 0 &&
      afterBoundary <= hardLimit &&
      afterBoundary - exactBoundary <= overshootBudget
    ) {
      return afterBoundary;
    }
  }

  const beforeBoundary = options.insideCodeFence
    ? findLineBoundary(remaining, preferred, "before")
    : findSegmentBoundary(remaining, preferred, options.locale, "before");

  if (beforeBoundary > 0 && beforeBoundary <= exactBoundary) {
    const beforeSlack = exactBoundary - beforeBoundary;
    if (beforeSlack <= clamp(options.maxOvershootChars + 1, 1, 3)) {
      return beforeBoundary;
    }
  }

  return Math.min(exactBoundary, hardLimit);
}
