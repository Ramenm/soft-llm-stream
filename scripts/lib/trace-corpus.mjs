import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createPresetTrace, createRandomTrace } from "./random-trace.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.resolve(__dirname, "../../test/fixtures/traces");

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

function formatTemplate(template, index, topic) {
  return template
    .replaceAll("{index}", String(index))
    .replaceAll("{topic}", topic);
}

function buildSectionedDocument({
  title,
  intro,
  topics,
  sectionCount = 10,
  paragraphs = [],
  bullets = [],
  codeBlock,
}) {
  const blocks = [`# ${title}`, intro];

  for (let index = 1; index <= sectionCount; index += 1) {
    const topic = topics[(index - 1) % topics.length];
    blocks.push(`## Section ${index}: ${topic}`);

    for (const paragraph of paragraphs) {
      blocks.push(formatTemplate(paragraph, index, topic));
    }

    if (bullets.length > 0) {
      blocks.push(
        bullets
          .map((bullet, bulletIndex) => `- ${formatTemplate(bullet, index + bulletIndex, topic)}`)
          .join("\n"),
      );
    }

    if (typeof codeBlock === "function" && index % 3 === 0) {
      blocks.push(codeBlock(index, topic));
    }
  }

  return blocks.join("\n\n");
}


function simplifyForExtremeText(text) {
  return String(text ?? "")
    .replace(/[\p{M}\u200c\u200d\ufe0e\ufe0f]/gu, "")
    .replace(/[\u{1f3fb}-\u{1f3ff}]/gu, "");
}

function repeatToAtLeastUnits(text, minUnits) {
  const units = getGraphemeUnits(text);
  if (units.length === 0) {
    return "";
  }

  const repeats = Math.max(1, Math.ceil(minUnits / units.length));
  return Array.from({ length: repeats }, () => text).join(" ");
}

function withFirstDelay(trace, delayMs) {
  return {
    ...trace,
    events: trace.events.map((event, index) =>
      index === 0 ? { ...event, delayMs } : event,
    ),
  };
}

const TEXT_LIBRARY = {
  prose:
    "The reveal controller should feel like someone is still typing, not like the UI is replaying network packets in visible bursts.",
  dense:
    "継続的な表示速度を保ちながら、不規則な到着パターンでも自然に読めることが重要です。",
  code:
    "```ts\nexport function sum(values: number[]) {\n  return values.reduce((total, value) => total + value, 0);\n}\n```",
  mixed:
    "A single answer can switch between English, русский, العربية, and 日本語 without the reveal cadence falling apart.",
  markdown:
    "1. First item\n2. Second item\n\n- Nested bullets should stay readable.\n- Inline code like `sum(a, b)` should not snap.",
};

const LONG_TEXT_LIBRARY = {
  report: buildSectionedDocument({
    title: "Streaming answer lab report",
    intro:
      "This synthetic answer is intentionally long so the lab can measure smoothing behavior on thousands of characters instead of only short demos.",
    topics: [
      "Arrival jitter",
      "Backlog reserve",
      "Long output pacing",
      "Completion tail",
      "Unicode safety",
      "Chunk visibility",
    ],
    sectionCount: 11,
    paragraphs: [
      "Section {index} reviews {topic} and explains why a frontend can receive medium or large deltas even when the model itself produced smaller internal steps.",
      "Operators usually care about perceived motion, latency to first visible text, and whether the UI keeps moving while backlog is still hidden. {topic} therefore needs enough entropy to mimic a real transport path.",
      `${TEXT_LIBRARY.prose} ${TEXT_LIBRARY.mixed}`,
    ],
    bullets: [
      "checkpoint {index}: keep visible speed steady while backlog remains in reserve",
      "checkpoint {index}: avoid a late dump when the answer still has hundreds of characters hidden",
      "checkpoint {index}: preserve readability in prose, code, and markdown-heavy replies",
    ],
    codeBlock(index, topic) {
      return `\`\`\`ts\nexport function measureSection${index}(snapshot) {\n  return {\n    topic: ${JSON.stringify(topic)},\n    hidden: snapshot.fullText.length - snapshot.text.length,\n    visible: snapshot.text.length,\n  };\n}\n\`\`\``;
    },
  }),
  codewalk: buildSectionedDocument({
    title: "Long code generation walkthrough",
    intro:
      "This document mixes explanation and code blocks to imitate a model that writes large implementation plans, diffs, and helper utilities in one response.",
    topics: [
      "stream adapters",
      "cadence estimates",
      "boundary guards",
      "runtime budgets",
      "integration tests",
    ],
    sectionCount: 13,
    paragraphs: [
      "Module {index} focuses on {topic} and arrives in visible batches that are closer to line-ish chunks than single-token drips.",
      "A realistic generator can emit dozens or even hundreds of characters per chunk when code fences, indentation, and comments are buffered together by the network edge.",
      `${TEXT_LIBRARY.code} ${TEXT_LIBRARY.prose}`,
    ],
    bullets: [
      "module {index}: keep comments and identifiers readable during catch-up",
      "module {index}: smooth bursts without rewriting grapheme boundaries",
    ],
    codeBlock(index, topic) {
      return `\`\`\`ts\nexport function build${index}Step(input) {\n  const lines = [\n    \"topic: ${topic}\",\n    \`input:\${String(input).trim()}\`,\n    \"status: buffered\",\n  ];\n  return lines.join(\"\\n\");\n}\n\`\`\``;
    },
  }),
  multilingual: buildSectionedDocument({
    title: "Multilingual long answer",
    intro:
      "This corpus entry deliberately mixes scripts, emoji, lists, and inline notation so the benchmark sees large outputs without losing grapheme safety.",
    topics: [
      "emoji pacing",
      "日本語の段落",
      "русский разбор",
      "العربية في الواجهة",
      "markdown tables",
    ],
    sectionCount: 10,
    paragraphs: [
      "Part {index} studies {topic} and keeps 👋🏽, こんにちは, Привет, and مرحبا stable even when the transport becomes bursty.",
      "The smoother should not care whether the hidden backlog contains prose, bullet lists, or code-like spans; it only needs to keep motion natural and predictable.",
      `${TEXT_LIBRARY.dense} ${TEXT_LIBRARY.markdown}`,
    ],
    bullets: [
      "example {index}: respect grapheme boundaries around emoji skin tones and combined marks",
      "example {index}: avoid visible snapping when one large chunk lands after a pause",
    ],
  }),
};

function buildLongTextLibrary(scale = 1) {
  const normalizedScale = Math.max(0.25, Number(scale) || 1);
  return {
    report: repeatToAtLeastUnits(LONG_TEXT_LIBRARY.report, Math.round(4200 * normalizedScale)),
    codewalk: repeatToAtLeastUnits(LONG_TEXT_LIBRARY.codewalk, Math.round(5000 * normalizedScale)),
    multilingual: repeatToAtLeastUnits(LONG_TEXT_LIBRARY.multilingual, Math.round(4600 * normalizedScale)),
  };
}

function getApproxCharsFromTokens(targetTokens, scale = 1) {
  const safeTokens = Math.max(1000, Number(targetTokens) || 50000);
  const safeScale = Math.max(0.1, Number(scale) || 1);
  return Math.round(safeTokens * 4 * safeScale);
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

function buildExtremeTextLibrary(options = {}) {
  const approxChars = getApproxCharsFromTokens(options.targetTokens, options.scale);
  return {
    approxChars,
    report: repeatToAtLeastUnits(simplifyForExtremeText(LONG_TEXT_LIBRARY.report), approxChars),
    codewalk: repeatToAtLeastUnits(simplifyForExtremeText(LONG_TEXT_LIBRARY.codewalk), Math.round(approxChars * 1.08)),
    multilingual: repeatToAtLeastUnits(simplifyForExtremeText(LONG_TEXT_LIBRARY.multilingual), Math.round(approxChars * 0.94)),
  };
}

function createLongOutputTrace(index, seed, scale = 1) {
  const longText = buildLongTextLibrary(scale);
  const family = index % 5;

  if (family === 0) {
    return createPresetTrace({
      preset: "llm-longform",
      seed,
      text: longText.report,
      name: `stress-longform-${seed}`,
    });
  }

  if (family === 1) {
    return createPresetTrace({
      preset: "llm-longform-grow",
      seed,
      text: longText.report,
      name: `stress-grow-${seed}`,
    });
  }

  if (family === 2) {
    return createPresetTrace({
      preset: "llm-longform-shrink",
      seed,
      text: longText.multilingual,
      name: `stress-shrink-${seed}`,
    });
  }

  if (family === 3) {
    return createPresetTrace({
      preset: "llm-mega-code",
      seed,
      text: longText.codewalk,
      name: `stress-mega-code-${seed}`,
    });
  }

  return createRandomTrace({
    seed,
    text: longText.multilingual,
    name: `stress-long-gap-${seed}`,
    firstDelayMs: 280,
    minDelayMs: 24,
    minDelayMsEnd: 20,
    maxDelayMs: 108,
    maxDelayMsEnd: 96,
    minChunkSize: 48,
    minChunkSizeEnd: 76,
    maxChunkSize: 164,
    maxChunkSizeEnd: 228,
    averageChunkSize: 92,
    averageChunkSizeEnd: 126,
    chunkSpread: 0.58,
    burstChance: 0.24,
    burstChanceEnd: 0.32,
    burstMultiplierMin: 1.16,
    burstMultiplierMax: 1.9,
    pauseChance: 0.1,
    pauseChanceEnd: 0.16,
    pauseMultiplierMin: 1.8,
    pauseMultiplierMax: 3.2,
    finalChunkMultiplier: 1.05,
  });
}

function createStressTrace(index, seed) {
  const textLibrary = [
    repeatToAtLeastUnits(TEXT_LIBRARY.prose, 1200),
    repeatToAtLeastUnits(TEXT_LIBRARY.dense, 900),
    repeatToAtLeastUnits(TEXT_LIBRARY.code, 950),
    repeatToAtLeastUnits(TEXT_LIBRARY.mixed, 1200),
    repeatToAtLeastUnits(TEXT_LIBRARY.markdown, 1100),
  ];
  const text = textLibrary[index % textLibrary.length];
  const family = index % 10;

  if (family === 0) {
    return createPresetTrace({
      preset: "drip",
      seed,
      text,
      name: `stress-drip-${seed}`,
    });
  }

  if (family === 1) {
    return createPresetTrace({
      preset: "bursty",
      seed,
      text,
      name: `stress-bursty-${seed}`,
    });
  }

  if (family === 2) {
    return createPresetTrace({
      preset: "chaotic",
      seed,
      text,
      name: `stress-chaotic-${seed}`,
    });
  }

  if (family === 3) {
    return createPresetTrace({
      preset: "completion-tail",
      seed,
      text,
      name: `stress-tail-${seed}`,
    });
  }

  if (family === 4) {
    return withFirstDelay(
      createPresetTrace({
        preset: "sawtooth",
        seed,
        text,
        name: `stress-ttft-${seed}`,
      }),
      250 + (index % 5) * 150,
    );
  }

  if (family === 5) {
    return createLongOutputTrace(0, seed, 0.65);
  }

  if (family === 6) {
    return createLongOutputTrace(2, seed, 0.75);
  }

  if (family === 7) {
    return createLongOutputTrace(3, seed, 0.7);
  }

  if (family === 8) {
    return createLongOutputTrace(5, seed, 0.8);
  }

  return createRandomTrace({
    seed,
    text,
    name: `stress-thousand-${seed}`,
    minDelayMs: 0,
    maxDelayMs: 18,
    minChunkSize: 1,
    maxChunkSize: 1,
    finalChunkMultiplier: index % 2 === 0 ? 1 : 3.6,
  });
}

export async function loadTraceFixtures() {
  const entries = await fs.readdir(fixtureDirectory, { withFileTypes: true });
  const traces = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }

    const fixturePath = path.join(fixtureDirectory, entry.name);
    const trace = JSON.parse(await fs.readFile(fixturePath, "utf8"));
    traces.push(trace);
  }

  return traces.sort((left, right) => left.name.localeCompare(right.name));
}

export async function buildBenchmarkCorpus() {
  const fixtures = await loadTraceFixtures();
  const generated = [
    createPresetTrace({
      preset: "drip",
      seed: 7,
      text: TEXT_LIBRARY.prose,
      name: "generated-drip-7",
    }),
    createPresetTrace({
      preset: "bursty",
      seed: 11,
      text: TEXT_LIBRARY.prose,
      name: "generated-bursty-11",
    }),
    createPresetTrace({
      preset: "chaotic",
      seed: 13,
      text: TEXT_LIBRARY.prose,
      name: "generated-chaotic-13",
    }),
    createPresetTrace({
      preset: "completion-tail",
      seed: 17,
      text: TEXT_LIBRARY.prose,
      name: "generated-completion-tail-17",
    }),
    createPresetTrace({
      preset: "sawtooth",
      seed: 19,
      text: TEXT_LIBRARY.code,
      name: "generated-code-sawtooth-19",
    }),
    createPresetTrace({
      preset: "bursty",
      seed: 23,
      text: TEXT_LIBRARY.dense,
      name: "generated-dense-bursty-23",
    }),
    createPresetTrace({
      preset: "chaotic",
      seed: 29,
      text: TEXT_LIBRARY.mixed,
      name: "generated-mixed-chaotic-29",
    }),
    createPresetTrace({
      preset: "sawtooth",
      seed: 31,
      text: TEXT_LIBRARY.markdown,
      name: "generated-markdown-sawtooth-31",
    }),
    createPresetTrace({
      preset: "llm-longform",
      seed: 37,
      text: buildLongTextLibrary(1).report,
      name: "generated-longform-report-37",
    }),
    createPresetTrace({
      preset: "llm-longform-grow",
      seed: 41,
      text: buildLongTextLibrary(1.1).report,
      name: "generated-longform-grow-41",
    }),
    createPresetTrace({
      preset: "llm-longform-shrink",
      seed: 43,
      text: buildLongTextLibrary(1.05).multilingual,
      name: "generated-longform-shrink-43",
    }),
    createPresetTrace({
      preset: "llm-mega-code",
      seed: 47,
      text: buildLongTextLibrary(1).codewalk,
      name: "generated-mega-code-47",
    }),
  ];

  return [...fixtures, ...generated];
}

export function buildLongOutputBenchmarkCorpus(options = {}) {
  const scale = Math.max(1, Number(options.scale) || 1);
  const library = buildLongTextLibrary(scale);

  return [
    createPresetTrace({
      preset: "llm-longform",
      seed: 501,
      text: library.report,
      name: `longform-report-${scale}`,
    }),
    createPresetTrace({
      preset: "llm-mega-code",
      seed: 503,
      text: library.codewalk,
      name: `longform-code-${scale}`,
    }),
    createPresetTrace({
      preset: "llm-longform-grow",
      seed: 507,
      text: library.report,
      name: `longform-grow-${scale}`,
    }),
    createPresetTrace({
      preset: "llm-longform-shrink",
      seed: 509,
      text: library.multilingual,
      name: `longform-shrink-${scale}`,
    }),
    createRandomTrace({
      seed: 521,
      text: library.multilingual,
      name: `longform-wide-random-${scale}`,
      firstDelayMs: 310,
      minDelayMs: 22,
      minDelayMsEnd: 16,
      maxDelayMs: 104,
      maxDelayMsEnd: 82,
      minChunkSize: 40,
      minChunkSizeEnd: 74,
      maxChunkSize: 158,
      maxChunkSizeEnd: 244,
      averageChunkSize: 86,
      averageChunkSizeEnd: 138,
      chunkSpread: 0.62,
      burstChance: 0.18,
      burstChanceEnd: 0.34,
      burstMultiplierMin: 1.14,
      burstMultiplierMax: 1.95,
      pauseChance: 0.1,
      pauseChanceEnd: 0.18,
      pauseMultiplierMin: 1.7,
      pauseMultiplierMax: 3.4,
      finalChunkMultiplier: 1.05,
    }),
  ];
}

export function buildExtremeBenchmarkCorpus(options = {}) {
  const targetTokens = Math.max(1000, Number(options.targetTokens) || 50000);
  const scale = Math.max(0.1, Number(options.scale) || 1);
  const library = buildExtremeTextLibrary({ targetTokens, scale });
  const tokenLabel = Math.round(targetTokens * scale);

  return [
    createRandomTrace({
      seed: 9001,
      text: library.report,
      name: `extreme-random-ttft-${tokenLabel}`,
      firstDelayMs: 3200,
      minDelayMs: 28,
      minDelayMsEnd: 18,
      maxDelayMs: 220,
      maxDelayMsEnd: 96,
      minChunkSize: 24,
      minChunkSizeEnd: 64,
      maxChunkSize: 180,
      maxChunkSizeEnd: 260,
      averageChunkSize: 96,
      averageChunkSizeEnd: 118,
      chunkSpread: 0.72,
      burstChance: 0.18,
      burstChanceEnd: 0.34,
      burstMultiplierMin: 1.1,
      burstMultiplierMax: 2.4,
      pauseChance: 0.14,
      pauseChanceEnd: 0.2,
      pauseMultiplierMin: 1.8,
      pauseMultiplierMax: 10,
      finalChunkMultiplier: 1.04,
    }),
    createRandomTrace({
      seed: 9011,
      text: library.codewalk,
      name: `extreme-mega-code-${tokenLabel}`,
      firstDelayMs: 2600,
      minDelayMs: 16,
      minDelayMsEnd: 14,
      maxDelayMs: 104,
      maxDelayMsEnd: 88,
      minChunkSize: 42,
      minChunkSizeEnd: 72,
      maxChunkSize: 220,
      maxChunkSizeEnd: 320,
      averageChunkSize: 128,
      averageChunkSizeEnd: 144,
      chunkSpread: 0.66,
      burstChance: 0.26,
      burstChanceEnd: 0.36,
      burstMultiplierMin: 1.12,
      burstMultiplierMax: 2.2,
      pauseChance: 0.12,
      pauseChanceEnd: 0.16,
      pauseMultiplierMin: 1.6,
      pauseMultiplierMax: 7.5,
      finalChunkMultiplier: 1.02,
    }),
    createRandomTrace({
      seed: 9021,
      text: library.multilingual,
      name: `extreme-ramp-up-${tokenLabel}`,
      firstDelayMs: 5400,
      minDelayMs: 180,
      minDelayMsEnd: 26,
      maxDelayMs: 680,
      maxDelayMsEnd: 120,
      minChunkSize: 10,
      minChunkSizeEnd: 64,
      maxChunkSize: 110,
      maxChunkSizeEnd: 260,
      averageChunkSize: 36,
      averageChunkSizeEnd: 128,
      chunkSpread: 0.7,
      burstChance: 0.08,
      burstChanceEnd: 0.26,
      burstMultiplierMin: 1.08,
      burstMultiplierMax: 2.1,
      pauseChance: 0.24,
      pauseChanceEnd: 0.1,
      pauseMultiplierMin: 1.7,
      pauseMultiplierMax: 8.6,
      finalChunkMultiplier: 1.06,
    }),
    createRandomTrace({
      seed: 9031,
      text: library.report,
      name: `extreme-ramp-down-${tokenLabel}`,
      firstDelayMs: 1800,
      minDelayMs: 22,
      minDelayMsEnd: 140,
      maxDelayMs: 112,
      maxDelayMsEnd: 540,
      minChunkSize: 84,
      minChunkSizeEnd: 12,
      maxChunkSize: 240,
      maxChunkSizeEnd: 120,
      averageChunkSize: 144,
      averageChunkSizeEnd: 34,
      chunkSpread: 0.74,
      burstChance: 0.28,
      burstChanceEnd: 0.1,
      burstMultiplierMin: 1.14,
      burstMultiplierMax: 2.5,
      pauseChance: 0.08,
      pauseChanceEnd: 0.24,
      pauseMultiplierMin: 1.7,
      pauseMultiplierMax: 9.4,
      finalChunkMultiplier: 1.08,
    }),
    createRandomTrace({
      seed: 9041,
      text: library.multilingual,
      name: `extreme-chaos-${tokenLabel}`,
      firstDelayMs: 900,
      minDelayMs: 0,
      minDelayMsEnd: 8,
      maxDelayMs: 280,
      maxDelayMsEnd: 340,
      minChunkSize: 1,
      minChunkSizeEnd: 4,
      maxChunkSize: 320,
      maxChunkSizeEnd: 340,
      averageChunkSize: 104,
      averageChunkSizeEnd: 112,
      chunkSpread: 0.95,
      burstChance: 0.34,
      burstChanceEnd: 0.4,
      burstMultiplierMin: 1.15,
      burstMultiplierMax: 2.75,
      pauseChance: 0.18,
      pauseChanceEnd: 0.22,
      pauseMultiplierMin: 1.8,
      pauseMultiplierMax: 12,
      finalChunkMultiplier: 1.03,
    }),
  ];
}


export function buildIdleGapBenchmarkCorpus(options = {}) {
  const targetTokens = Math.max(1000, Number(options.targetTokens) || 50000);
  const scale = Math.max(0.1, Number(options.scale) || 1);
  const library = buildExtremeTextLibrary({ targetTokens, scale });
  const tokenLabel = Math.round(targetTokens * scale);

  return [
    createRandomTrace({
      seed: 9101,
      text: library.report,
      name: `idle-minute-first-token-${tokenLabel}`,
      firstDelayMs: 72 * SECOND_MS,
      minDelayMs: 90,
      minDelayMsEnd: 26,
      maxDelayMs: 850,
      maxDelayMsEnd: 140,
      minChunkSize: 18,
      minChunkSizeEnd: 54,
      maxChunkSize: 150,
      maxChunkSizeEnd: 240,
      averageChunkSize: 64,
      averageChunkSizeEnd: 122,
      chunkSpread: 0.74,
      burstChance: 0.12,
      burstChanceEnd: 0.3,
      burstMultiplierMin: 1.1,
      burstMultiplierMax: 2.2,
      pauseChance: 0.18,
      pauseChanceEnd: 0.08,
      pauseMultiplierMin: 1.8,
      pauseMultiplierMax: 8,
      stallChance: 0.012,
      stallChanceEnd: 0.022,
      stallMinMs: 12 * SECOND_MS,
      stallMinMsEnd: 25 * SECOND_MS,
      stallMaxMs: 48 * SECOND_MS,
      stallMaxMsEnd: 92 * SECOND_MS,
      finalChunkMultiplier: 1.04,
    }),
    createRandomTrace({
      seed: 9111,
      text: library.codewalk,
      name: `idle-timeout-edge-${tokenLabel}`,
      firstDelayMs: 52 * SECOND_MS,
      minDelayMs: 16,
      minDelayMsEnd: 18,
      maxDelayMs: 220,
      maxDelayMsEnd: 320,
      minChunkSize: 46,
      minChunkSizeEnd: 24,
      maxChunkSize: 260,
      maxChunkSizeEnd: 160,
      averageChunkSize: 138,
      averageChunkSizeEnd: 72,
      chunkSpread: 0.86,
      burstChance: 0.24,
      burstChanceEnd: 0.18,
      burstMultiplierMin: 1.12,
      burstMultiplierMax: 2.6,
      pauseChance: 0.12,
      pauseChanceEnd: 0.22,
      pauseMultiplierMin: 1.7,
      pauseMultiplierMax: 9,
      stallChance: 0.02,
      stallChanceEnd: 0.03,
      stallMinMs: 18 * SECOND_MS,
      stallMinMsEnd: 35 * SECOND_MS,
      stallMaxMs: 62 * SECOND_MS,
      stallMaxMsEnd: 105 * SECOND_MS,
      finalChunkMultiplier: 1.05,
    }),
    createRandomTrace({
      seed: 9121,
      text: library.multilingual,
      name: `idle-random-chaos-${tokenLabel}`,
      firstDelayMs: 9 * SECOND_MS,
      minDelayMs: 0,
      minDelayMsEnd: 10,
      maxDelayMs: 360,
      maxDelayMsEnd: 420,
      minChunkSize: 2,
      minChunkSizeEnd: 4,
      maxChunkSize: 360,
      maxChunkSizeEnd: 420,
      averageChunkSize: 118,
      averageChunkSizeEnd: 124,
      chunkSpread: 1.02,
      burstChance: 0.34,
      burstChanceEnd: 0.42,
      burstMultiplierMin: 1.14,
      burstMultiplierMax: 2.85,
      pauseChance: 0.18,
      pauseChanceEnd: 0.22,
      pauseMultiplierMin: 1.9,
      pauseMultiplierMax: 11,
      stallChance: 0.018,
      stallChanceEnd: 0.03,
      stallMinMs: 14 * SECOND_MS,
      stallMinMsEnd: 26 * SECOND_MS,
      stallMaxMs: 70 * SECOND_MS,
      stallMaxMsEnd: 110 * SECOND_MS,
      finalChunkMultiplier: 1.03,
    }),
    createRandomTrace({
      seed: 9131,
      text: library.report,
      name: `idle-backlog-whiplash-${tokenLabel}`,
      firstDelayMs: 21 * SECOND_MS,
      minDelayMs: 280,
      minDelayMsEnd: 8,
      maxDelayMs: 1600,
      maxDelayMsEnd: 52,
      minChunkSize: 8,
      minChunkSizeEnd: 92,
      maxChunkSize: 120,
      maxChunkSizeEnd: 340,
      averageChunkSize: 28,
      averageChunkSizeEnd: 164,
      chunkSpread: 0.82,
      burstChance: 0.06,
      burstChanceEnd: 0.36,
      burstMultiplierMin: 1.08,
      burstMultiplierMax: 2.3,
      pauseChance: 0.24,
      pauseChanceEnd: 0.06,
      pauseMultiplierMin: 1.8,
      pauseMultiplierMax: 8.5,
      stallChance: 0.028,
      stallChanceEnd: 0.012,
      stallMinMs: 25 * SECOND_MS,
      stallMinMsEnd: 12 * SECOND_MS,
      stallMaxMs: 95 * SECOND_MS,
      stallMaxMsEnd: 48 * SECOND_MS,
      finalChunkMultiplier: 1.06,
    }),
  ];
}

export function buildSearchCorpus() {
  const traces = [];
  let seed = 41;

  for (const preset of [
    "drip",
    "bursty",
    "chaotic",
    "completion-tail",
    "sawtooth",
    "llm-bursty",
    "llm-code",
    "llm-longform",
  ]) {
    for (const text of Object.values(TEXT_LIBRARY)) {
      for (let index = 0; index < 4; index += 1) {
        traces.push(
          createPresetTrace({
            preset,
            seed,
            text,
            name: `${preset}-search-${seed}`,
          }),
        );
        seed += 1;
      }
    }
  }

  return traces;
}

export function buildStressCorpus(options = {}) {
  const count = Math.max(1, Number(options.count) || 1000);
  const traces = [];
  let seed = 1001;

  for (let index = 0; index < count; index += 1) {
    traces.push(createStressTrace(index, seed));
    seed += 1;
  }

  return traces;
}
