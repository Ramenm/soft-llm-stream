import test from "node:test";
import assert from "node:assert/strict";

import { createSoftLlmStream } from "../dist/index.js";

function createIterable(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

test("text adapter reconstructs plain streamed text", async () => {
  const store = createSoftLlmStream({
    source: createIterable(["Hello", " ", "world"]),
    adapter: "text",
    reveal: false,
  });

  const result = await store.start();
  assert.equal(result.status, "done");
  assert.equal(result.text, "Hello world");
});

test("SSE adapter normalizes legacy Chat Completions chunks with an optional usage trailer", async () => {
  const events = [];
  const store = createSoftLlmStream({
    source: createIterable([
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" there"},"finish_reason":null}]}\n\n',
      'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n',
      'data: [DONE]\n\n',
    ]),
    adapter: "sse",
    reveal: false,
    onEvent(event) {
      events.push(event);
    },
  });

  const result = await store.start();
  assert.equal(result.text, "Hello there");
  assert.equal(events.filter((event) => event.type === "done").length, 1);
  assert.ok(
    events.some(
      (event) =>
        event.type === "meta" &&
        event.data.usage &&
        event.data.usage.total_tokens === 12,
    ),
  );
});

test("SSE adapter does not duplicate finalized OpenAI Responses text", async () => {
  const events = [];
  const store = createSoftLlmStream({
    source: createIterable([
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"Hel"}\n\n',
      'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"lo"}\n\n',
      'event: response.output_text.done\ndata: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":"Hello"}\n\n',
      'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_1"}}\n\n',
    ]),
    adapter: "sse",
    reveal: false,
    onEvent(event) {
      events.push(event);
    },
  });

  const result = await store.start();
  assert.equal(result.text, "Hello");
  assert.equal(events.filter((event) => event.type === "done").length, 1);
});

test("SSE adapter normalizes Anthropic message streams", async () => {
  const events = [];
  const store = createSoftLlmStream({
    source: createIterable([
      'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[]}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]),
    adapter: "sse",
    reveal: false,
    onEvent(event) {
      events.push(event);
    },
  });

  const result = await store.start();
  assert.equal(result.text, "Hello there");
  assert.equal(events.filter((event) => event.type === "done").length, 1);
  assert.ok(events.some((event) => event.type === "meta"));
});

test("SSE adapter normalizes AI SDK data streams", async () => {
  const events = [];
  const store = createSoftLlmStream({
    source: createIterable([
      'data: {"type":"start","messageId":"m1"}\n\n',
      'data: {"type":"text-start","id":"t1"}\n\n',
      'data: {"type":"text-delta","id":"t1","delta":"Hello"}\n\n',
      'data: {"type":"text-delta","id":"t1","delta":" there"}\n\n',
      'data: {"type":"text-end","id":"t1"}\n\n',
      'data: {"type":"finish"}\n\n',
      'data: [DONE]\n\n',
    ]),
    adapter: "sse",
    reveal: false,
    onEvent(event) {
      events.push(event);
    },
  });

  const result = await store.start();
  assert.equal(result.text, "Hello there");
  assert.equal(events.filter((event) => event.type === "done").length, 1);
});

test("JSONL adapter supports replace snapshots for cumulative and corrected text", async () => {
  const store = createSoftLlmStream({
    source: createIterable([
      '{"type":"text","text":"Hel"}\n',
      '{"type":"replace","text":"Hello"}\n',
      '{"type":"replace","text":"Hello world"}\n',
      '{"type":"done"}\n',
    ]),
    adapter: "jsonl",
    reveal: false,
  });

  const result = await store.start();
  assert.equal(result.text, "Hello world");
});

test("event adapter normalizes provider event objects directly", async () => {
  const store = createSoftLlmStream({
    source: createIterable([
      { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: "Hel" },
      { type: "response.output_text.delta", output_index: 0, content_index: 0, delta: "lo" },
      { type: "response.output_text.done", output_index: 0, content_index: 0, text: "Hello" },
      { type: "response.completed", response: { id: "resp_1" } },
    ]),
    adapter: "event",
    reveal: false,
  });

  const result = await store.start();
  assert.equal(result.text, "Hello");
});

test("auto adapter sniffs SSE and JSONL string streams", async () => {
  const sseStore = createSoftLlmStream({
    source: createIterable([
      'event: message\ndata: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
      'data: [DONE]\n\n',
    ]),
    adapter: "auto",
    reveal: false,
  });

  const jsonlStore = createSoftLlmStream({
    source: createIterable([
      '{"type":"text","text":"Hello"}\n',
      '{"type":"replace","text":"Hello there"}\n',
      '{"type":"done"}\n',
    ]),
    adapter: "auto",
    reveal: false,
  });

  const [sseResult, jsonlResult] = await Promise.all([
    sseStore.start(),
    jsonlStore.start(),
  ]);

  assert.equal(sseResult.text, "Hello there");
  assert.equal(jsonlResult.text, "Hello there");
});



test("SSE adapter ignores control fields like id and retry", async () => {
  const events = [];
  const store = createSoftLlmStream({
    source: createIterable([
      'id: 7\n',
      'retry: 1000\n',
      'event: message\n',
      'data: {"type":"text","text":"Hello"}\n\n',
      'data: [DONE]\n\n',
    ]),
    adapter: "sse",
    reveal: false,
    onEvent(event) {
      events.push(event);
    },
  });

  const result = await store.start();
  assert.equal(result.text, "Hello");
  assert.equal(events.filter((event) => event.type === "done").length, 1);
});

test("auto adapter waits for fragmented structured prefixes before defaulting to text", async () => {
  const sseStore = createSoftLlmStream({
    source: createIterable([
      "ev",
      'ent: message\n',
      'data: {"type":"text","text":"Hello"}\n\n',
      'data: [DONE]\n\n',
    ]),
    adapter: "auto",
    reveal: false,
  });

  const jsonlStore = createSoftLlmStream({
    source: createIterable([
      '{"ty',
      'pe":"text","text":"Hello"}\n',
      '{"type":"replace","text":"Hello there"}\n',
      '{"type":"done"}\n',
    ]),
    adapter: "auto",
    reveal: false,
  });

  const [sseResult, jsonlResult] = await Promise.all([
    sseStore.start(),
    jsonlStore.start(),
  ]);

  assert.equal(sseResult.text, "Hello");
  assert.equal(jsonlResult.text, "Hello there");
});

test("auto adapter can detect fragmented structured bodies in fetch responses", async () => {
  const sseResponse = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("dat"));
        controller.enqueue(new TextEncoder().encode('a: {"type":"text","text":"Hello"}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );

  const jsonlResponse = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"ty'));
        controller.enqueue(new TextEncoder().encode('pe":"text","text":"Hello"}\n'));
        controller.enqueue(new TextEncoder().encode('{"type":"done"}\n'));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );

  const [sseResult, jsonlResult] = await Promise.all([
    createSoftLlmStream({ source: sseResponse, adapter: "auto", reveal: false }).start(),
    createSoftLlmStream({ source: jsonlResponse, adapter: "auto", reveal: false }).start(),
  ]);

  assert.equal(sseResult.text, "Hello");
  assert.equal(jsonlResult.text, "Hello");
});

test("JSONL adapter preserves plain-text fallback whitespace", async () => {
  const store = createSoftLlmStream({
    source: createIterable([
      "  indented plain text  \n",
      '{"type":"done"}\n',
    ]),
    adapter: "jsonl",
    reveal: false,
  });

  const result = await store.start();
  assert.equal(result.text, "  indented plain text  ");
});

test("auto adapter chooses event mode for object streams", async () => {
  const store = createSoftLlmStream({
    source: createIterable([
      { type: "text", text: "Hello" },
      { type: "replace", text: "Hello there" },
      { type: "done" },
    ]),
    adapter: "auto",
    reveal: false,
  });

  const result = await store.start();
  assert.equal(result.text, "Hello there");
});
