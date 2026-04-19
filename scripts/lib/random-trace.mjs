const COMPLEX_GRAPHEME_RE = /[\p{M}\u200c\u200d\ufe0e\ufe0f]|[\u{1f3fb}-\u{1f3ff}]/u;

function getGraphemeUnits(text) {
  const source = String(text ?? "");
  if (!source) {
    return [];
  }

  if (!COMPLEX_GRAPHEME_RE.test(source)) {
    return Array.from(source);
  }

  const SegmenterCtor = globalThis.Intl?.Segmenter;

  if (typeof SegmenterCtor === "function") {
    try {
      const segmenter = new SegmenterCtor(undefined, {
        granularity: "grapheme",
      });
      return [...segmenter.segment(source)].map((part) => part.segment);
    } catch {
      // fall through to Array.from
    }
  }

  return Array.from(source);
}

export function createSeededRandom(seed = Date.now()) {
  let state = Number(seed) >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export const TRACE_PRESETS = {
  drip: {
    minDelayMs: 20,
    maxDelayMs: 80,
    minChunkSize: 1,
    maxChunkSize: 4,
  },
  bursty: {
    minDelayMs: 18,
    maxDelayMs: 220,
    minChunkSize: 2,
    maxChunkSize: 12,
  },
  chaotic: {
    minDelayMs: 8,
    maxDelayMs: 320,
    minChunkSize: 1,
    maxChunkSize: 18,
  },
  sawtooth: {
    minDelayMs: 25,
    maxDelayMs: 140,
    minChunkSize: 1,
    maxChunkSize: 10,
    alternatingBurst: true,
  },
  "completion-tail": {
    minDelayMs: 40,
    maxDelayMs: 160,
    minChunkSize: 1,
    maxChunkSize: 8,
    finalChunkMultiplier: 2.6,
  },
  "llm-bursty": {
    firstDelayMs: 180,
    minDelayMs: 24,
    maxDelayMs: 92,
    minChunkSize: 5,
    maxChunkSize: 28,
    averageChunkSize: 15,
    chunkSpread: 0.5,
    burstChance: 0.2,
    burstMultiplierMin: 1.35,
    burstMultiplierMax: 2.1,
    pauseChance: 0.16,
    pauseMultiplierMin: 1.8,
    pauseMultiplierMax: 3.1,
    finalChunkMultiplier: 1.2,
  },
  "llm-code": {
    firstDelayMs: 220,
    minDelayMs: 22,
    maxDelayMs: 110,
    minChunkSize: 8,
    maxChunkSize: 44,
    averageChunkSize: 24,
    chunkSpread: 0.55,
    burstChance: 0.24,
    burstMultiplierMin: 1.4,
    burstMultiplierMax: 2.35,
    pauseChance: 0.14,
    pauseMultiplierMin: 1.6,
    pauseMultiplierMax: 2.7,
    finalChunkMultiplier: 1.1,
  },
  "llm-longform": {
    firstDelayMs: 260,
    minDelayMs: 24,
    maxDelayMs: 118,
    minChunkSize: 42,
    maxChunkSize: 168,
    averageChunkSize: 94,
    chunkSpread: 0.52,
    burstChance: 0.24,
    burstMultiplierMin: 1.18,
    burstMultiplierMax: 1.82,
    pauseChance: 0.12,
    pauseMultiplierMin: 1.55,
    pauseMultiplierMax: 2.5,
    finalChunkMultiplier: 1.06,
  },
  "llm-longform-grow": {
    firstDelayMs: 250,
    minDelayMs: 34,
    minDelayMsEnd: 18,
    maxDelayMs: 126,
    maxDelayMsEnd: 88,
    minChunkSize: 26,
    minChunkSizeEnd: 62,
    maxChunkSize: 96,
    maxChunkSizeEnd: 192,
    averageChunkSize: 54,
    averageChunkSizeEnd: 122,
    chunkSpread: 0.48,
    burstChance: 0.18,
    burstChanceEnd: 0.28,
    burstMultiplierMin: 1.2,
    burstMultiplierMax: 1.95,
    pauseChance: 0.14,
    pauseChanceEnd: 0.08,
    pauseMultiplierMin: 1.5,
    pauseMultiplierMax: 2.35,
    finalChunkMultiplier: 1.04,
  },
  "llm-longform-shrink": {
    firstDelayMs: 235,
    minDelayMs: 18,
    minDelayMsEnd: 32,
    maxDelayMs: 84,
    maxDelayMsEnd: 134,
    minChunkSize: 66,
    minChunkSizeEnd: 24,
    maxChunkSize: 196,
    maxChunkSizeEnd: 92,
    averageChunkSize: 128,
    averageChunkSizeEnd: 48,
    chunkSpread: 0.44,
    burstChance: 0.22,
    burstChanceEnd: 0.08,
    burstMultiplierMin: 1.16,
    burstMultiplierMax: 1.72,
    pauseChance: 0.08,
    pauseChanceEnd: 0.2,
    pauseMultiplierMin: 1.45,
    pauseMultiplierMax: 2.4,
    finalChunkMultiplier: 1.08,
  },
  "llm-mega-code": {
    firstDelayMs: 280,
    minDelayMs: 18,
    maxDelayMs: 92,
    minChunkSize: 54,
    maxChunkSize: 210,
    averageChunkSize: 112,
    chunkSpread: 0.5,
    burstChance: 0.3,
    burstMultiplierMin: 1.22,
    burstMultiplierMax: 1.92,
    pauseChance: 0.11,
    pauseMultiplierMin: 1.45,
    pauseMultiplierMax: 2.3,
    finalChunkMultiplier: 1.03,
  },
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, ratio) {
  const progress = clamp(Number(ratio) || 0, 0, 1);
  return start + (end - start) * progress;
}

function resolveProgressiveNumber(startValue, endValue, ratio, fallback = NaN) {
  const startNumber = Number(startValue);
  const endNumber = Number(endValue);
  const hasStart = Number.isFinite(startNumber);
  const hasEnd = Number.isFinite(endNumber);

  if (hasStart && hasEnd) {
    return lerp(startNumber, endNumber, ratio);
  }

  if (hasStart) {
    return startNumber;
  }

  if (hasEnd) {
    return endNumber;
  }

  return fallback;
}

function percentile(values, ratio) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * clamp(ratio, 0, 1);
  const lowerIndex = Math.floor(index);
  const upperIndex = Math.ceil(index);

  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }

  const remainder = index - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * remainder;
}

function mean(values) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function countWhere(values, predicate) {
  let count = 0;

  for (const value of values) {
    if (predicate(value)) {
      count += 1;
    }
  }

  return count;
}

function chooseChunkSize(random, options) {
  const minChunkSize = Math.max(1, Number(options.minChunkSize) || 1);
  const maxChunkSize = Math.max(minChunkSize, Number(options.maxChunkSize) || minChunkSize);
  const averageChunkSize = Number(options.averageChunkSize);
  const chunkSpread = clamp(Number(options.chunkSpread) || 0.45, 0, 1.5);

  if (!Number.isFinite(averageChunkSize)) {
    const chunkSpan = maxChunkSize - minChunkSize + 1;
    return minChunkSize + Math.floor(random() * Math.max(1, chunkSpan));
  }

  const offset = (random() + random() - 1) * chunkSpread;
  const chunkSize = Math.round(averageChunkSize * (1 + offset));
  return clamp(chunkSize, minChunkSize, maxChunkSize);
}

function chooseDelayMs(random, options) {
  const minDelayMs = Math.max(0, Number(options.minDelayMs) || 0);
  const maxDelayMs = Math.max(minDelayMs, Number(options.maxDelayMs) || minDelayMs);
  const delaySpan = maxDelayMs - minDelayMs;
  let delayMs = Math.round(minDelayMs + random() * Math.max(0, delaySpan));

  const pauseChance = clamp(Number(options.pauseChance) || 0, 0, 1);
  if (pauseChance > 0 && random() < pauseChance) {
    const pauseMultiplierMin = Math.max(1, Number(options.pauseMultiplierMin) || 1);
    const pauseMultiplierMax = Math.max(
      pauseMultiplierMin,
      Number(options.pauseMultiplierMax) || pauseMultiplierMin,
    );
    const pauseMultiplier =
      pauseMultiplierMin + random() * (pauseMultiplierMax - pauseMultiplierMin);
    delayMs = Math.round(delayMs * pauseMultiplier);
  }

  const stallChance = clamp(Number(options.stallChance) || 0, 0, 1);
  if (stallChance > 0 && random() < stallChance) {
    const stallMinMs = Math.max(0, Number(options.stallMinMs) || 0);
    const stallMaxMs = Math.max(stallMinMs, Number(options.stallMaxMs) || stallMinMs);
    const stallDelayMs = Math.round(
      stallMinMs + random() * Math.max(0, stallMaxMs - stallMinMs),
    );
    delayMs += stallDelayMs;
  }

  return delayMs;
}

export function estimateTokenCountFromChars(totalChars, charsPerToken = 4) {
  const safeChars = Math.max(0, Number(totalChars) || 0);
  const safeCharsPerToken = Math.max(1, Number(charsPerToken) || 4);
  return safeChars / safeCharsPerToken;
}

export function summarizeTrace(trace) {
  const events = Array.isArray(trace?.events) ? trace.events : [];
  const chunkSizes = events.map((event) => getGraphemeUnits(event.text).length);
  const gapSizes = events.slice(1).map((event) => Math.max(0, Number(event.delayMs) || 0));
  const totalDurationMs = events.reduce(
    (total, event) => total + Math.max(0, Number(event.delayMs) || 0),
    0,
  );
  const totalChars = chunkSizes.reduce((total, size) => total + size, 0);

  const estimatedTokens = estimateTokenCountFromChars(totalChars);

  return {
    chunkCount: events.length,
    totalChars,
    estimatedTokens,
    totalDurationMs,
    durationMinutes: totalDurationMs / 60_000,
    firstDelayMs: events.length > 0 ? Math.max(0, Number(events[0].delayMs) || 0) : 0,
    meanChunkChars: mean(chunkSizes),
    medianChunkChars: percentile(chunkSizes, 0.5),
    p90ChunkChars: percentile(chunkSizes, 0.9),
    maxChunkChars: chunkSizes.length > 0 ? Math.max(...chunkSizes) : 0,
    meanGapMs: mean(gapSizes),
    medianGapMs: percentile(gapSizes, 0.5),
    p90GapMs: percentile(gapSizes, 0.9),
    maxGapMs: gapSizes.length > 0 ? Math.max(...gapSizes) : 0,
    gapsOver5Sec: countWhere(gapSizes, (value) => value >= 5_000),
    gapsOver10Sec: countWhere(gapSizes, (value) => value >= 10_000),
    gapsOver30Sec: countWhere(gapSizes, (value) => value >= 30_000),
    gapsOver60Sec: countWhere(gapSizes, (value) => value >= 60_000),
    charsPerSecond:
      totalDurationMs > 0 ? (totalChars / totalDurationMs) * 1000 : 0,
    estimatedTokensPerSecond:
      totalDurationMs > 0 ? (estimatedTokens / totalDurationMs) * 1000 : 0,
  };
}

export function createRandomTrace({
  name,
  text,
  seed = Date.now(),
  firstDelayMs = 0,
  minDelayMs = 20,
  minDelayMsEnd,
  maxDelayMs = 250,
  maxDelayMsEnd,
  minChunkSize = 1,
  minChunkSizeEnd,
  maxChunkSize = 12,
  maxChunkSizeEnd,
  averageChunkSize,
  averageChunkSizeEnd,
  chunkSpread = 0.45,
  burstChance = 0,
  burstChanceEnd,
  burstMultiplierMin = 1.2,
  burstMultiplierMax = 1.8,
  pauseChance = 0,
  pauseChanceEnd,
  pauseMultiplierMin = 1.4,
  pauseMultiplierMax = 2.4,
  stallChance = 0,
  stallChanceEnd,
  stallMinMs = 0,
  stallMinMsEnd,
  stallMaxMs = 0,
  stallMaxMsEnd,
  finalChunkMultiplier = 1,
  alternatingBurst = false,
} = {}) {
  const sourceText = String(text ?? "").trim();
  const sourceUnits = getGraphemeUnits(sourceText);
  const random = createSeededRandom(seed);
  const events = [];
  let cursor = 0;
  let burstToggle = false;

  while (cursor < sourceUnits.length) {
    const progress =
      sourceUnits.length > 1
        ? cursor / Math.max(1, sourceUnits.length - 1)
        : 0;
    const currentMinChunkSize = Math.max(
      1,
      Math.round(
        resolveProgressiveNumber(minChunkSize, minChunkSizeEnd, progress, minChunkSize),
      ),
    );
    const currentMaxChunkSize = Math.max(
      currentMinChunkSize,
      Math.round(
        resolveProgressiveNumber(maxChunkSize, maxChunkSizeEnd, progress, maxChunkSize),
      ),
    );
    const currentAverageChunkSize = resolveProgressiveNumber(
      averageChunkSize,
      averageChunkSizeEnd,
      progress,
      NaN,
    );
    const currentBurstChance = clamp(
      resolveProgressiveNumber(burstChance, burstChanceEnd, progress, burstChance),
      0,
      1,
    );
    const currentPauseChance = clamp(
      resolveProgressiveNumber(pauseChance, pauseChanceEnd, progress, pauseChance),
      0,
      1,
    );
    const currentStallChance = clamp(
      resolveProgressiveNumber(stallChance, stallChanceEnd, progress, stallChance),
      0,
      1,
    );
    const currentStallMinMs = Math.max(
      0,
      Math.round(resolveProgressiveNumber(stallMinMs, stallMinMsEnd, progress, stallMinMs)),
    );
    const currentStallMaxMs = Math.max(
      currentStallMinMs,
      Math.round(resolveProgressiveNumber(stallMaxMs, stallMaxMsEnd, progress, stallMaxMs)),
    );
    const currentMinDelayMs = Math.max(
      0,
      Math.round(resolveProgressiveNumber(minDelayMs, minDelayMsEnd, progress, minDelayMs)),
    );
    const currentMaxDelayMs = Math.max(
      currentMinDelayMs,
      Math.round(resolveProgressiveNumber(maxDelayMs, maxDelayMsEnd, progress, maxDelayMs)),
    );

    let chunkSize = chooseChunkSize(random, {
      minChunkSize: currentMinChunkSize,
      maxChunkSize: currentMaxChunkSize,
      averageChunkSize: currentAverageChunkSize,
      chunkSpread,
    });

    if (currentBurstChance > 0 && random() < currentBurstChance) {
      const burstMultiplier =
        Math.max(1, Number(burstMultiplierMin) || 1) +
        random() *
          Math.max(
            0,
            Math.max(1, Number(burstMultiplierMax) || 1) -
              Math.max(1, Number(burstMultiplierMin) || 1),
          );
      chunkSize = Math.round(chunkSize * burstMultiplier);
    }

    if (alternatingBurst) {
      burstToggle = !burstToggle;
      chunkSize = burstToggle
        ? Math.max(currentMinChunkSize, Math.floor(chunkSize * 0.6))
        : Math.min(currentMaxChunkSize * 2, Math.round(chunkSize * 1.7));
    }

    chunkSize = clamp(
      chunkSize,
      currentMinChunkSize,
      Math.max(currentMinChunkSize, currentMaxChunkSize * 2),
    );

    if (
      finalChunkMultiplier > 1 &&
      sourceUnits.length - cursor <= currentMaxChunkSize * 2
    ) {
      chunkSize = Math.round(chunkSize * finalChunkMultiplier);
    }

    const delayMs =
      events.length === 0
        ? Math.max(0, Number(firstDelayMs) || 0)
        : chooseDelayMs(random, {
            minDelayMs: currentMinDelayMs,
            maxDelayMs: currentMaxDelayMs,
            pauseChance: currentPauseChance,
            pauseMultiplierMin,
            pauseMultiplierMax,
            stallChance: currentStallChance,
            stallMinMs: currentStallMinMs,
            stallMaxMs: currentStallMaxMs,
          });
    const chunkText = sourceUnits.slice(cursor, cursor + chunkSize).join("");

    events.push({ delayMs, text: chunkText });
    cursor += getGraphemeUnits(chunkText).length;
  }

  return {
    name: name ?? `random-${seed}`,
    seed,
    text: sourceText,
    events,
  };
}

export function createPresetTrace({
  preset = "bursty",
  text,
  seed = Date.now(),
  name,
} = {}) {
  return createRandomTrace({
    text,
    seed,
    name: name ?? `${preset}-${seed}`,
    ...(TRACE_PRESETS[preset] ?? TRACE_PRESETS.bursty),
  });
}

export async function* replayTraceEvents(events, signal) {
  for (const event of events) {
    if (signal?.aborted) {
      return;
    }

    const delayMs = Math.max(0, Number(event.delayMs) || 0);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (signal?.aborted) {
      return;
    }

    yield String(event.text ?? "");
  }
}
