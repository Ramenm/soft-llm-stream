import type {
  BuiltInStreamAdapterName,
  StreamAdapter,
  StreamAdapterName,
  StreamChunk,
  StreamEvent,
  StreamSource,
} from "./core-types.js";
import {
  createAbortError,
  isAsyncIterableSource,
  isReadableStreamString,
  isResponse,
} from "./core-utils.js";

type RawChunk = StreamChunk | StreamEvent;

type StructuredStreamEnvelope = {
  eventName?: string | null;
};

type OrderedTextAccumulator = {
  order: string[];
  textByKey: Map<string, string>;
};

type StructuredStreamNormalizerState = {
  emittedDone: boolean;
  lastText: string;
  openAi: OrderedTextAccumulator;
  anthropic: OrderedTextAccumulator;
  aiSdk: OrderedTextAccumulator;
};

type PreparedStreamAdapter = {
  source: StreamSource;
  adapter: StreamAdapter;
};

const AUTO_SNIFF_MAX_CHUNKS = 8;
const AUTO_SNIFF_MAX_CHARS = 4096;
const KNOWN_SSE_FIELD_PREFIXES = [":", "data:", "event:", "id:", "retry:"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Uint8Array)
    ? (value as Record<string, unknown>)
    : null;
}

function getString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toKey(value: unknown, fallback: string): string {
  if (typeof value === "string" && value) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function omitType(record: Record<string, unknown>) {
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (key === "type") {
      continue;
    }
    next[key] = value;
  }

  return next;
}

function createOrderedTextAccumulator(): OrderedTextAccumulator {
  return {
    order: [],
    textByKey: new Map(),
  };
}

function getAccumulatorText(accumulator: OrderedTextAccumulator) {
  let text = "";

  for (const key of accumulator.order) {
    text += accumulator.textByKey.get(key) ?? "";
  }

  return text;
}

function setAccumulatorText(
  accumulator: OrderedTextAccumulator,
  key: string,
  text: string,
) {
  if (!accumulator.textByKey.has(key)) {
    accumulator.order.push(key);
  }

  accumulator.textByKey.set(key, text);
  return getAccumulatorText(accumulator);
}

function appendAccumulatorText(
  accumulator: OrderedTextAccumulator,
  key: string,
  delta: string,
) {
  return setAccumulatorText(
    accumulator,
    key,
    (accumulator.textByKey.get(key) ?? "") + delta,
  );
}

function createStructuredStreamNormalizerState(): StructuredStreamNormalizerState {
  return {
    emittedDone: false,
    lastText: "",
    openAi: createOrderedTextAccumulator(),
    anthropic: createOrderedTextAccumulator(),
    aiSdk: createOrderedTextAccumulator(),
  };
}

function appendTextEvent(
  state: StructuredStreamNormalizerState,
  text: string,
): StreamEvent[] {
  if (!text) {
    return [];
  }

  state.lastText += text;
  return [{ type: "text", text } satisfies StreamEvent];
}

function replaceTextEvent(
  state: StructuredStreamNormalizerState,
  text: string,
): StreamEvent[] {
  if (text === state.lastText) {
    return [];
  }

  state.lastText = text;
  return [{ type: "replace", text } satisfies StreamEvent];
}

function transitionToText(
  state: StructuredStreamNormalizerState,
  nextText: string,
): StreamEvent[] {
  if (nextText === state.lastText) {
    return [];
  }

  if (nextText.startsWith(state.lastText)) {
    return appendTextEvent(state, nextText.slice(state.lastText.length));
  }

  return replaceTextEvent(state, nextText);
}

function emitDoneEvent(state: StructuredStreamNormalizerState): StreamEvent[] {
  if (state.emittedDone) {
    return [];
  }

  state.emittedDone = true;
  return [{ type: "done" } satisfies StreamEvent];
}

function emitMetaEvent(data: Record<string, unknown>): StreamEvent[] {
  return [{ type: "meta", data } satisfies StreamEvent];
}

function extractTextFromUnknownPayload(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => extractTextFromUnknownPayload(item)).join("");
  }

  const record = asRecord(value);
  if (!record) {
    return "";
  }

  const normalizedType = getString(record.type)?.toLowerCase();
  if (
    normalizedType &&
    (normalizedType.includes("tool") ||
      normalizedType.includes("reason") ||
      normalizedType.includes("input_audio") ||
      normalizedType.includes("function") ||
      normalizedType.includes("signature") ||
      normalizedType.includes("ping") ||
      normalizedType.endsWith("_start") ||
      normalizedType.endsWith("_stop") ||
      normalizedType === "start" ||
      normalizedType === "finish")
  ) {
    return "";
  }

  const directCandidates = [
    record.text,
    record.delta,
    record.content,
    record.output_text,
    record.completion,
    record.partial,
  ];

  for (const candidate of directCandidates) {
    const extracted = extractTextFromUnknownPayload(candidate);
    if (extracted) {
      return extracted;
    }
  }

  const deltaRecord = asRecord(record.delta);
  if (deltaRecord) {
    const deltaCandidates = [
      deltaRecord.text,
      deltaRecord.content,
      deltaRecord.output_text,
    ];

    for (const candidate of deltaCandidates) {
      const extracted = extractTextFromUnknownPayload(candidate);
      if (extracted) {
        return extracted;
      }
    }
  }

  const nestedCandidates = [
    record.choices,
    record.choice,
    record.candidate,
    record.candidates,
    record.output,
    record.parts,
    record.content_block,
    record.content_block_delta,
  ];

  for (const candidate of nestedCandidates) {
    const extracted = extractTextFromUnknownPayload(candidate);
    if (extracted) {
      return extracted;
    }
  }

  return "";
}

function extractReplaceTextFromUnknownPayload(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => extractReplaceTextFromUnknownPayload(item))
      .join("");
  }

  const record = asRecord(value);
  if (!record) {
    return "";
  }

  const directCandidates = [
    record.text,
    record.fullText,
    record.full_text,
    record.output_text,
    record.content,
    record.snapshot,
    record.value,
    record.message,
    record.response,
  ];

  for (const candidate of directCandidates) {
    const extracted = extractTextFromUnknownPayload(candidate);
    if (extracted) {
      return extracted;
    }
  }

  return "";
}

function normalizeDirectEventPayload(
  record: Record<string, unknown>,
  state: StructuredStreamNormalizerState,
): StreamEvent[] | null {
  const type = getString(record.type);
  if (!type) {
    return null;
  }

  if (type === "text") {
    const text = getString(record.text);
    return text == null ? [] : appendTextEvent(state, text);
  }

  if (type === "replace") {
    const text = extractReplaceTextFromUnknownPayload(record);
    return text ? replaceTextEvent(state, text) : [];
  }

  if (type === "meta") {
    const data = asRecord(record.data) ?? omitType(record);
    return emitMetaEvent(data);
  }

  if (type === "done") {
    return emitDoneEvent(state);
  }

  if (type === "error") {
    return [
      {
        type: "error",
        error: record.error ?? record,
      } satisfies StreamEvent,
    ];
  }

  return null;
}

function normalizeOpenAiResponsesPayload(
  record: Record<string, unknown>,
  state: StructuredStreamNormalizerState,
): StreamEvent[] | null {
  const type = getString(record.type);
  if (!type || !type.startsWith("response.")) {
    return null;
  }

  const key = `${toKey(record.output_index, "0")}:${toKey(record.content_index, "0")}`;

  if (type === "response.output_text.delta") {
    const delta = getString(record.delta);
    return delta
      ? transitionToText(state, appendAccumulatorText(state.openAi, key, delta))
      : [];
  }

  if (type === "response.output_text.done") {
    const text = getString(record.text);
    return text == null
      ? []
      : transitionToText(state, setAccumulatorText(state.openAi, key, text));
  }

  if (type === "response.failed" || type === "response.error") {
    return [
      {
        type: "error",
        error: record.error ?? record,
      } satisfies StreamEvent,
    ];
  }

  return emitMetaEvent(record);
}

function normalizeAnthropicPayload(
  record: Record<string, unknown>,
  state: StructuredStreamNormalizerState,
): StreamEvent[] | null {
  const type = getString(record.type);
  if (!type) {
    return null;
  }

  if (type === "message_start" || type === "message_delta" || type === "ping") {
    return emitMetaEvent(record);
  }

  if (type === "message_stop") {
    return emitDoneEvent(state);
  }

  if (type === "content_block_start") {
    const contentBlock = asRecord(record.content_block);
    if (getString(contentBlock?.type) === "text") {
      const key = toKey(record.index, `anthropic:${state.anthropic.order.length}`);
      const text = getString(contentBlock?.text) ?? "";
      return text
        ? transitionToText(state, setAccumulatorText(state.anthropic, key, text))
        : [];
    }

    return emitMetaEvent(record);
  }

  if (type === "content_block_delta") {
    const delta = asRecord(record.delta);
    const deltaType = getString(delta?.type);
    if (deltaType === "text_delta") {
      const key = toKey(record.index, `anthropic:${state.anthropic.order.length}`);
      const text = getString(delta?.text);
      return text
        ? transitionToText(state, appendAccumulatorText(state.anthropic, key, text))
        : [];
    }

    return emitMetaEvent(record);
  }

  if (type === "content_block_stop") {
    return [];
  }

  return null;
}

function isAiSdkTypedPart(type: string) {
  return type === "start" ||
    type === "finish" ||
    type === "message-metadata" ||
    type.startsWith("text-") ||
    type.startsWith("reasoning-") ||
    type.startsWith("source-") ||
    type.startsWith("tool-") ||
    type.startsWith("file-") ||
    type.startsWith("step-") ||
    type.startsWith("data-");
}

function normalizeAiSdkPayload(
  record: Record<string, unknown>,
  state: StructuredStreamNormalizerState,
): StreamEvent[] | null {
  const type = getString(record.type);
  if (!type || !isAiSdkTypedPart(type)) {
    return null;
  }

  if (type === "text-start") {
    const key = toKey(record.id, `ai-sdk:${state.aiSdk.order.length}`);
    const existingText = getString(record.text) ?? "";
    return existingText
      ? transitionToText(state, setAccumulatorText(state.aiSdk, key, existingText))
      : [];
  }

  if (type === "text-delta") {
    const key = toKey(record.id, `ai-sdk:${state.aiSdk.order.length}`);
    const delta = getString(record.delta);
    return delta
      ? transitionToText(state, appendAccumulatorText(state.aiSdk, key, delta))
      : [];
  }

  if (type === "text-end") {
    return [];
  }

  if (type === "finish") {
    return emitDoneEvent(state);
  }

  return emitMetaEvent(record);
}

function normalizeStructuredPayload(
  payload: unknown,
  state: StructuredStreamNormalizerState,
  _envelope: StructuredStreamEnvelope = {},
): StreamEvent[] {
  const record = asRecord(payload);
  if (!record) {
    const text = extractTextFromUnknownPayload(payload);
    return text ? appendTextEvent(state, text) : [];
  }

  return (
    normalizeDirectEventPayload(record, state) ??
    normalizeOpenAiResponsesPayload(record, state) ??
    normalizeAnthropicPayload(record, state) ??
    normalizeAiSdkPayload(record, state) ??
    ((): StreamEvent[] | null => {
      const type = getString(record.type)?.toLowerCase();
      if (
        type === "replace" ||
        type === "snapshot" ||
        type === "text-snapshot" ||
        type === "message-snapshot" ||
        type === "set-text"
      ) {
        const text = extractReplaceTextFromUnknownPayload(record);
        return text ? replaceTextEvent(state, text) : [];
      }

      const fallbackText = extractTextFromUnknownPayload(record);
      if (fallbackText) {
        return appendTextEvent(state, fallbackText);
      }

      return emitMetaEvent(record);
    })() ??
    []
  );
}

async function* createRawChunkIterator(
  source: StreamSource,
  signal: AbortSignal,
): AsyncIterable<RawChunk> {
  if (isResponse(source)) {
    if (!source.ok) {
      throw new Error(`HTTP_${source.status}`);
    }
    if (!source.body) {
      return;
    }

    const reader = source.body.getReader();
    try {
      while (true) {
        if (signal.aborted) {
          try {
            await reader.cancel();
          } catch {
            // ignore cancellation noise
          }
          throw createAbortError();
        }

        const result = await reader.read();
        if (result.done) {
          break;
        }
        if (result.value == null) {
          continue;
        }
        yield result.value;
      }
      return;
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
  }

  if (isReadableStreamString(source)) {
    const reader = source.getReader();
    try {
      while (true) {
        if (signal.aborted) {
          try {
            await reader.cancel();
          } catch {
            // ignore cancellation noise
          }
          throw createAbortError();
        }

        const result = await reader.read();
        if (result.done) {
          break;
        }
        if (result.value == null) {
          continue;
        }
        yield result.value as RawChunk;
      }
      return;
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
  }

  if (!isAsyncIterableSource(source)) {
    return;
  }

  for await (const chunk of source) {
    if (signal.aborted) {
      throw createAbortError();
    }
    if (chunk == null) {
      continue;
    }
    yield chunk as RawChunk;
  }
}

function decodeTextChunk(decoder: TextDecoder, chunk: RawChunk) {
  if (typeof chunk === "string") {
    return chunk;
  }

  if (chunk instanceof Uint8Array) {
    return decoder.decode(chunk, { stream: true });
  }

  throw new Error("NON_TEXT_CHUNK_REQUIRES_EVENT_ADAPTER");
}

async function* createTextChunkIterator(
  source: StreamSource,
  signal: AbortSignal,
): AsyncIterable<string> {
  const decoder = new TextDecoder();

  for await (const chunk of createRawChunkIterator(source, signal)) {
    const text = decodeTextChunk(decoder, chunk);
    if (text) {
      yield text;
    }
  }

  const tail = decoder.decode();
  if (tail) {
    yield tail;
  }
}

function createReplayAsyncIterable(
  initialChunks: readonly RawChunk[],
  iterator: AsyncIterator<RawChunk>,
): AsyncIterable<RawChunk> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of initialChunks) {
        yield chunk;
      }

      while (true) {
        const next = await iterator.next();
        if (next.done) {
          break;
        }
        yield next.value;
      }
    },
  };
}

function startsWithKnownSseFieldPrefix(text: string) {
  return KNOWN_SSE_FIELD_PREFIXES.some((prefix) => text.startsWith(prefix));
}

function isPotentialSseFieldPrefix(text: string) {
  if (!text) {
    return false;
  }

  return KNOWN_SSE_FIELD_PREFIXES.some((prefix) => prefix.startsWith(text));
}

function detectAdapterFromTextProbe(
  text: string,
  final = false,
): BuiltInStreamAdapterName | null {
  const trimmed = text.trimStart();
  if (!trimmed) {
    return final ? "text" : null;
  }

  const normalized = trimmed.toLowerCase();
  if (startsWithKnownSseFieldPrefix(normalized)) {
    return "sse";
  }

  if (!final && isPotentialSseFieldPrefix(normalized)) {
    return null;
  }

  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const firstLineNormalized = firstLine.toLowerCase();
  if (startsWithKnownSseFieldPrefix(firstLineNormalized)) {
    return "sse";
  }

  if (!final && isPotentialSseFieldPrefix(firstLineNormalized)) {
    return null;
  }

  if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed !== "[DONE]") {
    const candidate = (trimmed.includes("\n") ? firstLine : trimmed).trim();

    try {
      const parsed = JSON.parse(candidate) as unknown;
      return parsed != null && typeof parsed === "object" ? "jsonl" : "text";
    } catch {
      if (!final && candidate.length < AUTO_SNIFF_MAX_CHARS) {
        return null;
      }
      return "text";
    }
  }

  return "text";
}

function detectAdapterFromResponseContentType(
  source: Response,
): StreamAdapter | null {
  const contentType = source.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("text/event-stream")) {
    return adapters.sse;
  }
  if (
    contentType.includes("application/x-ndjson") ||
    contentType.includes("application/jsonl") ||
    contentType.includes("application/jsonlines")
  ) {
    return adapters.jsonl;
  }

  return null;
}

async function detectAdapterFromResponseBody(
  source: Response,
  signal: AbortSignal,
): Promise<StreamAdapter | null> {
  if (!source.body) {
    return null;
  }

  try {
    const clone = source.clone();
    let probe = "";
    let chunkCount = 0;

    for await (const chunk of createTextChunkIterator(clone, signal)) {
      probe += chunk;
      chunkCount += 1;

      const adapterName = detectAdapterFromTextProbe(probe);
      if (adapterName) {
        return adapterName === "text" ? null : adapters[adapterName];
      }

      if (probe.length >= AUTO_SNIFF_MAX_CHARS || chunkCount >= AUTO_SNIFF_MAX_CHUNKS) {
        break;
      }
    }

    const adapterName = detectAdapterFromTextProbe(probe, true);
    return adapterName && adapterName !== "text" ? adapters[adapterName] : null;
  } catch {
    return null;
  }
}

async function prepareAutoAdapterForNonResponseSource(
  source: StreamSource,
  signal: AbortSignal,
): Promise<PreparedStreamAdapter> {
  const iterator = createRawChunkIterator(source, signal)[Symbol.asyncIterator]();
  const initialChunks: RawChunk[] = [];
  const decoder = new TextDecoder();
  let probe = "";

  while (
    initialChunks.length < AUTO_SNIFF_MAX_CHUNKS &&
    probe.length < AUTO_SNIFF_MAX_CHARS
  ) {
    const next = await iterator.next();

    if (next.done) {
      probe += decoder.decode();
      const adapterName = detectAdapterFromTextProbe(probe, true) ?? "text";
      return {
        source: createReplayAsyncIterable(initialChunks, iterator),
        adapter: adapters[adapterName],
      };
    }

    initialChunks.push(next.value);
    const directEvent = normalizeDirectEventPayload(
      asRecord(next.value) ?? { type: "__not-an-event__" },
      createStructuredStreamNormalizerState(),
    );

    if (
      directEvent != null ||
      (typeof next.value !== "string" && !(next.value instanceof Uint8Array))
    ) {
      return {
        source: createReplayAsyncIterable(initialChunks, iterator),
        adapter: adapters.event,
      };
    }

    probe += next.value instanceof Uint8Array
      ? decoder.decode(next.value, { stream: true })
      : next.value;

    const adapterName = detectAdapterFromTextProbe(probe);
    if (adapterName) {
      return {
        source: createReplayAsyncIterable(initialChunks, iterator),
        adapter: adapters[adapterName],
      };
    }
  }

  return {
    source: createReplayAsyncIterable(initialChunks, iterator),
    adapter: adapters.text,
  };
}

async function* consumeTextAdapter(
  source: StreamSource,
  context: { signal: AbortSignal },
) {
  for await (const chunk of createTextChunkIterator(source, context.signal)) {
    if (chunk) {
      yield { type: "text", text: chunk } satisfies StreamEvent;
    }
  }
  yield { type: "done" } satisfies StreamEvent;
}

async function* consumeEventAdapter(
  source: StreamSource,
  context: { signal: AbortSignal },
) {
  const state = createStructuredStreamNormalizerState();
  const decoder = new TextDecoder();

  for await (const chunk of createRawChunkIterator(source, context.signal)) {
    if (typeof chunk === "string") {
      for (const event of appendTextEvent(state, chunk)) {
        yield event;
      }
      continue;
    }

    if (chunk instanceof Uint8Array) {
      for (const event of appendTextEvent(
        state,
        decoder.decode(chunk, { stream: true }),
      )) {
        yield event;
      }
      continue;
    }

    for (const event of normalizeStructuredPayload(chunk, state)) {
      yield event;
    }
  }

  const tail = decoder.decode();
  if (tail) {
    for (const event of appendTextEvent(state, tail)) {
      yield event;
    }
  }

  for (const event of emitDoneEvent(state)) {
    yield event;
  }
}

async function* consumeJsonlAdapter(
  source: StreamSource,
  context: { signal: AbortSignal },
) {
  const state = createStructuredStreamNormalizerState();
  let buffer = "";

  for await (const chunk of createTextChunkIterator(source, context.signal)) {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");

    while (newlineIndex !== -1) {
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      const trimmed = line.trim();

      if (trimmed) {
        try {
          const payload = JSON.parse(line) as unknown;
          for (const event of normalizeStructuredPayload(payload, state)) {
            yield event;
          }
        } catch {
          for (const event of appendTextEvent(state, line)) {
            yield event;
          }
        }
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }

  const tailLine = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
  const tail = tailLine.trim();
  if (tail) {
    try {
      const payload = JSON.parse(tailLine) as unknown;
      for (const event of normalizeStructuredPayload(payload, state)) {
        yield event;
      }
    } catch {
      for (const event of appendTextEvent(state, tailLine)) {
        yield event;
      }
    }
  }

  for (const event of emitDoneEvent(state)) {
    yield event;
  }
}

async function* consumeSseAdapter(
  source: StreamSource,
  context: { signal: AbortSignal },
) {
  const state = createStructuredStreamNormalizerState();
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const flushEvent = async function* () {
    if (dataLines.length === 0) {
      eventName = "message";
      return;
    }

    const data = dataLines.join("\n");
    dataLines = [];

    if (data === "[DONE]" || eventName === "done") {
      eventName = "message";
      for (const event of emitDoneEvent(state)) {
        yield event;
      }
      return;
    }

    try {
      const payload = JSON.parse(data) as unknown;
      for (const event of normalizeStructuredPayload(payload, state, { eventName })) {
        yield event;
      }
    } catch {
      for (const event of appendTextEvent(state, data)) {
        yield event;
      }
    } finally {
      eventName = "message";
    }
  };

  for await (const chunk of createTextChunkIterator(source, context.signal)) {
    buffer += chunk;

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

      if (!line) {
        for await (const event of flushEvent()) {
          yield event;
        }
        newlineIndex = buffer.indexOf("\n");
        continue;
      }

      if (line.startsWith(":")) {
        newlineIndex = buffer.indexOf("\n");
        continue;
      }

      const separatorIndex = line.indexOf(":");
      const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex);
      let value = separatorIndex === -1 ? "" : line.slice(separatorIndex + 1);
      if (value.startsWith(" ")) {
        value = value.slice(1);
      }

      if (field === "event") {
        eventName = value.trim() || "message";
        newlineIndex = buffer.indexOf("\n");
        continue;
      }

      if (field === "data") {
        dataLines.push(value);
        newlineIndex = buffer.indexOf("\n");
        continue;
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }

  if (dataLines.length > 0) {
    for await (const event of flushEvent()) {
      yield event;
    }
  }

  for (const event of emitDoneEvent(state)) {
    yield event;
  }
}

export const adapters: Record<BuiltInStreamAdapterName, StreamAdapter> = {
  text: {
    name: "text",
    consume: consumeTextAdapter,
  },
  sse: {
    name: "sse",
    consume: consumeSseAdapter,
  },
  jsonl: {
    name: "jsonl",
    consume: consumeJsonlAdapter,
  },
  event: {
    name: "event",
    consume: consumeEventAdapter,
  },
};

export function resolveAdapter(
  source: StreamSource,
  adapter: StreamAdapter | StreamAdapterName = "text",
): StreamAdapter {
  if (typeof adapter === "object" && adapter && "consume" in adapter) {
    return adapter;
  }

  if (adapter === "auto") {
    if (isResponse(source)) {
      return detectAdapterFromResponseContentType(source) ?? adapters.text;
    }
    return adapters.text;
  }

  return adapters[adapter];
}

export async function prepareSourceAdapter(
  source: StreamSource,
  adapter: StreamAdapter | StreamAdapterName = "text",
  signal: AbortSignal,
): Promise<PreparedStreamAdapter> {
  if (typeof adapter === "object" && adapter && "consume" in adapter) {
    return { source, adapter };
  }

  if (adapter !== "auto") {
    return {
      source,
      adapter: resolveAdapter(source, adapter),
    };
  }

  if (isResponse(source)) {
    const responseAdapter =
      detectAdapterFromResponseContentType(source) ??
      (await detectAdapterFromResponseBody(source, signal)) ??
      adapters.text;

    return {
      source,
      adapter: responseAdapter,
    };
  }

  return prepareAutoAdapterForNonResponseSource(source, signal);
}
