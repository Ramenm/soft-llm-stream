import {
  createRandomTrace,
  createPresetTrace,
  summarizeTrace,
} from "./scripts/lib/random-trace.mjs";

function withExtraDelay(trace, index, extraDelayMs) {
  return {
    ...trace,
    events: trace.events.map((event, eventIndex) =>
      eventIndex === index
        ? { ...event, delayMs: Math.max(0, event.delayMs + extraDelayMs) }
        : event,
    ),
  };
}

function repeatToApproxChars(text, minChars) {
  const source = String(text ?? "").trim();
  if (source.length === 0) {
    return "";
  }

  const repeats = Math.max(1, Math.ceil(minChars / source.length));
  return Array.from({ length: repeats }, () => source).join("\n\n");
}

function buildLongBrowserText({ title, topic, sections = 8, code = false }) {
  const blocks = [`# ${title}`];

  for (let index = 1; index <= sections; index += 1) {
    blocks.push(`## ${topic} ${index}`);
    blocks.push(
      `This section ${index} is intentionally longer so the browser lab can show several thousand visible characters and chunk sizes closer to real transport batches.`,
    );
    blocks.push(
      "The smoother should keep motion continuous even if one chunk arrives late, another chunk contains a whole sentence, and the next chunk suddenly contains a much larger buffered burst.",
    );

    if (code && index % 2 === 0) {
      blocks.push(
        "```ts\nexport function renderChunk(snapshot) {\n  return {\n    visible: snapshot.text.length,\n    hidden: snapshot.fullText.length - snapshot.text.length,\n  };\n}\n```",
      );
    } else {
      blocks.push(
        "- keep reveal speed perceptually steady\n- preserve grapheme boundaries\n- avoid the ugly final dump on large answers",
      );
    }
  }

  return blocks.join("\n\n");
}

const browserLongText = {
  report: repeatToApproxChars(
    buildLongBrowserText({
      title: "Long-form assistant report",
      topic: "Operational note",
      sections: 10,
    }),
    4300,
  ),
  code: repeatToApproxChars(
    buildLongBrowserText({
      title: "Long code walkthrough",
      topic: "Module",
      sections: 11,
      code: true,
    }),
    5000,
  ),
  mixed: repeatToApproxChars(
    "Smooth reveal should keep 👋🏽 emoji atomic, preserve こんにちは and Привет, handle markdown bullets, and survive long answers where chunks sometimes arrive around a hundred characters at once without turning the UI into a stop-and-dump animation.",
    4600,
  ),
};

function createDemoTrace({ trace, preset, name, description, text, seed, tweak }) {
  const sourceTrace =
    trace ??
    createPresetTrace({
      preset,
      name,
      text,
      seed,
    });
  const resolvedTrace = typeof tweak === "function" ? tweak(sourceTrace) : sourceTrace;
  return {
    ...resolvedTrace,
    description,
    stats: summarizeTrace(resolvedTrace),
  };
}

const realisticChatBatches = [
  {
    delayMs: 6500,
    text:
      "Here’s the plain version first: the model usually does not stream like a perfect token faucet in real products. The frontend often sees one visible batch only after buffering, moderation, or gateway work has already happened.",
  },
  {
    delayMs: 11800,
    text:
      "Then you get a second burst that contains far more than a sentence or two. It can feel like the answer was thinking in silence and then suddenly pushed a whole paragraph into the UI at once, which is exactly the awkward rhythm this trace is meant to mimic.",
  },
  {
    delayMs: 9400,
    text:
      "A third batch often arrives after another uncomfortable gap, especially when retrieval, tool work, or rate limiting briefly stalls the transport. Users perceive that as a freeze even if the backend is technically still making progress.",
  },
  {
    delayMs: 13200,
    text:
      "After that, the stream may resume with a chunky catch-up update that includes multiple clauses, a list item, or a full explanatory paragraph. Raw delivery makes that look jarring, while smoothing should keep the motion readable instead of stop-and-dump.",
  },
  {
    delayMs: 7800,
    text:
      "And finally the last visible batch lands with enough text to finish the answer naturally instead of dribbling out token by token. This should give you a realistic five-batch scenario with long 5-15 second pauses between frontend-visible updates.",
  },
];

const realisticChatTrace = {
  name: "realistic-chat",
  seed: 909,
  text: realisticChatBatches.map((batch) => batch.text).join(""),
  events: realisticChatBatches,
  description:
    "Five frontend-visible batches with realistic 5-15 second pauses, like a chat UI waiting through buffering and backend work.",
};

const realisticChatShortTrace = {
  name: "realistic-chat-short",
  seed: 910,
  text: [
    "This shorter variant still feels like a real chat product because nothing arrives continuously. The first visible chunk lands after a pause long enough for the user to wonder whether the assistant has started yet.",
    "Then a second batch appears with a whole sentence fragment already composed, which is a much closer match for buffered frontend delivery than a token-by-token faucet.",
    "A third update lands after another visible wait, enough to make the raw pane feel jerky while the smoothed pane keeps some motion alive between those larger drops.",
    "The fourth batch catches up with another paragraph-sized push, like the model resumed after a short moderation or gateway stall instead of typing in a perfectly even rhythm.",
    "Finally the answer wraps with one last large batch so the demo still shows a clean finish without dragging into a long synthetic document.",
  ].join(""),
  events: [
    {
      delayMs: 3200,
      text:
        "This shorter variant still feels like a real chat product because nothing arrives continuously. The first visible chunk lands after a pause long enough for the user to wonder whether the assistant has started yet.",
    },
    {
      delayMs: 4700,
      text:
        "Then a second batch appears with a whole sentence fragment already composed, which is a much closer match for buffered frontend delivery than a token-by-token faucet.",
    },
    {
      delayMs: 6100,
      text:
        "A third update lands after another visible wait, enough to make the raw pane feel jerky while the smoothed pane keeps some motion alive between those larger drops.",
    },
    {
      delayMs: 3900,
      text:
        "The fourth batch catches up with another paragraph-sized push, like the model resumed after a short moderation or gateway stall instead of typing in a perfectly even rhythm.",
    },
    {
      delayMs: 5400,
      text:
        "Finally the answer wraps with one last large batch so the demo still shows a clean finish without dragging into a long synthetic document.",
    },
  ],
  description:
    "Five frontend-visible batches with shorter 3-7 second pauses for a quicker but still realistic chat cadence.",
};

const realisticChatVerySlowTrace = {
  name: "realistic-chat-very-slow",
  seed: 911,
  text: [
    "This variant is intentionally uncomfortable: it behaves like a real product that buffers for a long time before each visible update, so users mostly stare at a quiet interface and then receive a dense block of text.",
    "The second batch lands after another long silence, large enough that raw delivery feels like a whole paragraph teleporting into the viewport instead of something naturally readable.",
    "A third gap follows with the same slow rhythm, which is useful when you want to see whether the smoothing logic keeps perceived motion alive during a painfully sparse response.",
    "The fourth batch arrives like a catch-up burst after backend work, retrieval, or network churn finally clears, making the raw stream look stalled and then abrupt.",
    "The final chunk closes the answer in one more delayed burst so the whole trace feels like a genuinely slow assistant rather than a synthetic typing animation.",
  ].join(""),
  events: [
    {
      delayMs: 10200,
      text:
        "This variant is intentionally uncomfortable: it behaves like a real product that buffers for a long time before each visible update, so users mostly stare at a quiet interface and then receive a dense block of text.",
    },
    {
      delayMs: 12100,
      text:
        "The second batch lands after another long silence, large enough that raw delivery feels like a whole paragraph teleporting into the viewport instead of something naturally readable.",
    },
    {
      delayMs: 14700,
      text:
        "A third gap follows with the same slow rhythm, which is useful when you want to see whether the smoothing logic keeps perceived motion alive during a painfully sparse response.",
    },
    {
      delayMs: 11300,
      text:
        "The fourth batch arrives like a catch-up burst after backend work, retrieval, or network churn finally clears, making the raw stream look stalled and then abrupt.",
    },
    {
      delayMs: 13800,
      text:
        "The final chunk closes the answer in one more delayed burst so the whole trace feels like a genuinely slow assistant rather than a synthetic typing animation.",
    },
  ],
  description:
    "Five frontend-visible batches with deliberately painful 10-15 second pauses, useful for testing very slow real-world chat behavior.",
};

const toolCallGapTrace = {
  name: "tool-call-gap",
  seed: 912,
  text: [
    "The first visible batch is small and reassuring, like the assistant has started responding before it calls a tool or waits on some extra backend work.",
    "A second batch follows quickly with a little more context, giving the user hope that the answer will continue normally.",
    "Then everything stalls for a long tool call gap while the UI appears frozen, which is exactly the kind of frustrating real-world pause this scenario is meant to demonstrate.",
    "When the backend finally returns, the next visible batch is much larger and feels like a catch-up dump rather than a natural continuation.",
    "The answer ends with one final cleanup batch so you can compare how raw delivery versus smoothing handles a tool-shaped stall in the middle.",
  ].join(""),
  events: [
    {
      delayMs: 1800,
      text:
        "The first visible batch is small and reassuring, like the assistant has started responding before it calls a tool or waits on some extra backend work.",
    },
    {
      delayMs: 2400,
      text:
        "A second batch follows quickly with a little more context, giving the user hope that the answer will continue normally.",
    },
    {
      delayMs: 13200,
      text:
        "Then everything stalls for a long tool call gap while the UI appears frozen, which is exactly the kind of frustrating real-world pause this scenario is meant to demonstrate.",
    },
    {
      delayMs: 2200,
      text:
        "When the backend finally returns, the next visible batch is much larger and feels like a catch-up dump rather than a natural continuation.",
    },
    {
      delayMs: 2600,
      text:
        "The answer ends with one final cleanup batch so you can compare how raw delivery versus smoothing handles a tool-shaped stall in the middle.",
    },
  ],
  description:
    "Fast opening batches, one long tool call stall, then a catch-up burst — useful when you want a tool call style gap in the middle of the stream.",
};

export function getBrowserDemoTraces() {
  return [
    createDemoTrace({
      preset: "llm-bursty",
      name: "llm-answer",
      seed: 101,
      description:
        "General chat prose with medium frontend-visible batches and a short startup pause.",
      text:
        "A realistic answer stream usually lands as medium text deltas: a word or two, then a short phrase, then an occasional burst when transport buffering releases a little backlog.",
    }),
    createDemoTrace({
      preset: "llm-code",
      name: "llm-codegen",
      seed: 202,
      description:
        "Code generation tends to arrive in chunkier, line-ish bursts rather than single-token drips.",
      text:
        "```ts\nexport async function collectAnswer(source) {\n  let text = \"\";\n  for await (const chunk of source) {\n    text += chunk.text ?? chunk.delta ?? \"\";\n  }\n  return text.trim();\n}\n```",
    }),
    createDemoTrace({
      preset: "llm-bursty",
      name: "gap-recovery",
      seed: 303,
      description:
        "Mostly normal batches, but with one obvious mid-stream network hiccup to smooth through.",
      text:
        "The controller should keep revealing through one awkward transport gap instead of stalling hard and then dumping a huge slab of text the instant the next chunk arrives.",
      tweak: (trace) => withExtraDelay(trace, 4, 220),
    }),
    createDemoTrace({
      preset: "llm-bursty",
      name: "unicode-mixed",
      seed: 404,
      description: "Chunkier multilingual output with emoji and CJK graphemes kept intact.",
      text:
        "Smooth reveal should keep 👋🏽 emoji atomic, preserve こんにちは and Привет, and still feel like a natural stream instead of a jittery byte dump.",
    }),
    createDemoTrace({
      trace: realisticChatTrace,
      name: realisticChatTrace.name,
      description: realisticChatTrace.description,
    }),
    createDemoTrace({
      trace: realisticChatShortTrace,
      name: realisticChatShortTrace.name,
      description: realisticChatShortTrace.description,
    }),
    createDemoTrace({
      trace: realisticChatVerySlowTrace,
      name: realisticChatVerySlowTrace.name,
      description: realisticChatVerySlowTrace.description,
    }),
    createDemoTrace({
      trace: toolCallGapTrace,
      name: toolCallGapTrace.name,
      description: toolCallGapTrace.description,
    }),
    createDemoTrace({
      preset: "llm-longform",
      name: "long-report-4k",
      seed: 505,
      description:
        "Thousands of characters with chunk sizes around the long-form range instead of tiny token drips.",
      text: browserLongText.report,
    }),
    createDemoTrace({
      preset: "llm-mega-code",
      name: "long-code-5k",
      seed: 606,
      description: "Large code-heavy response with broad line-ish chunks and a longer scrollable output.",
      text: browserLongText.code,
    }),
    createDemoTrace({
      trace: createRandomTrace({
        name: "ramp-up-long",
        seed: 707,
        text: browserLongText.report,
        firstDelayMs: 260,
        minDelayMs: 34,
        minDelayMsEnd: 16,
        maxDelayMs: 132,
        maxDelayMsEnd: 86,
        minChunkSize: 22,
        minChunkSizeEnd: 72,
        maxChunkSize: 84,
        maxChunkSizeEnd: 210,
        averageChunkSize: 46,
        averageChunkSizeEnd: 126,
        chunkSpread: 0.52,
        burstChance: 0.18,
        burstChanceEnd: 0.3,
        burstMultiplierMin: 1.18,
        burstMultiplierMax: 2,
        pauseChance: 0.14,
        pauseChanceEnd: 0.08,
        pauseMultiplierMin: 1.6,
        pauseMultiplierMax: 2.6,
        finalChunkMultiplier: 1.04,
      }),
      name: "ramp-up-long",
      description: "Starts with medium batches, then grows into visibly larger chunk sizes later in the answer.",
    }),
    createDemoTrace({
      trace: createRandomTrace({
        name: "ramp-down-long",
        seed: 808,
        text: browserLongText.mixed,
        firstDelayMs: 240,
        minDelayMs: 16,
        minDelayMsEnd: 30,
        maxDelayMs: 88,
        maxDelayMsEnd: 132,
        minChunkSize: 70,
        minChunkSizeEnd: 20,
        maxChunkSize: 214,
        maxChunkSizeEnd: 92,
        averageChunkSize: 132,
        averageChunkSizeEnd: 44,
        chunkSpread: 0.48,
        burstChance: 0.26,
        burstChanceEnd: 0.08,
        burstMultiplierMin: 1.14,
        burstMultiplierMax: 1.78,
        pauseChance: 0.08,
        pauseChanceEnd: 0.2,
        pauseMultiplierMin: 1.5,
        pauseMultiplierMax: 2.7,
        finalChunkMultiplier: 1.08,
      }),
      name: "ramp-down-long",
      description: "Starts with very large batches and narrows toward smaller chunks near the end to cover the opposite direction.",
    }),
  ];
}
