import { createSoftLlmStream } from '../../dist/index.js';

function createIterable(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

export const PROTOCOL_SCENARIOS = [
  {
    name: 'openai-responses-sse',
    adapter: 'sse',
    expectedText: 'Hello',
    source: () =>
      createIterable([
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"Hel"}\n\n',
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"lo"}\n\n',
        'event: response.output_text.done\ndata: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":"Hello"}\n\n',
        'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_1"}}\n\n',
      ]),
  },
  {
    name: 'openai-chat-completions-sse',
    adapter: 'sse',
    expectedText: 'Hello there',
    source: () =>
      createIterable([
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":" there"},"finish_reason":null}]}\n\n',
        'data: {"id":"chatcmpl-1","object":"chat.completion.chunk","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\n',
        'data: [DONE]\n\n',
      ]),
  },
  {
    name: 'anthropic-messages-sse',
    adapter: 'sse',
    expectedText: 'Hello there',
    source: () =>
      createIterable([
        'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[]}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" there"}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ]),
  },
  {
    name: 'ai-sdk-ui-sse',
    adapter: 'sse',
    expectedText: 'Hello there',
    source: () =>
      createIterable([
        'data: {"type":"start","messageId":"m1"}\n\n',
        'data: {"type":"text-start","id":"t1"}\n\n',
        'data: {"type":"text-delta","id":"t1","delta":"Hello"}\n\n',
        'data: {"type":"text-delta","id":"t1","delta":" there"}\n\n',
        'data: {"type":"finish"}\n\n',
        'data: [DONE]\n\n',
      ]),
  },
  {
    name: 'normalized-jsonl-replace',
    adapter: 'jsonl',
    expectedText: 'Hello there',
    source: () =>
      createIterable([
        '{"type":"text","text":"Hello"}\n',
        '{"type":"replace","text":"Hello there"}\n',
        '{"type":"done"}\n',
      ]),
  },
  {
    name: 'sse-control-fields',
    adapter: 'sse',
    expectedText: 'Hello',
    source: () =>
      createIterable([
        'id: 7\n',
        'retry: 1000\n',
        'event: message\n',
        'data: {"type":"text","text":"Hello"}\n\n',
        'data: [DONE]\n\n',
      ]),
  },
  {
    name: 'fragmented-sse-auto',
    adapter: 'auto',
    expectedText: 'Hello',
    source: () =>
      createIterable([
        'ev',
        'ent: message\n',
        'data: {"type":"text","text":"Hello"}\n\n',
        'data: [DONE]\n\n',
      ]),
  },
  {
    name: 'fragmented-jsonl-auto',
    adapter: 'auto',
    expectedText: 'Hello there',
    source: () =>
      createIterable([
        '{"ty',
        'pe":"text","text":"Hello"}\n',
        '{"type":"replace","text":"Hello there"}\n',
        '{"type":"done"}\n',
      ]),
  },
  {
    name: 'object-event-stream-auto',
    adapter: 'auto',
    expectedText: 'Hello there',
    source: () =>
      createIterable([
        { type: 'text', text: 'Hello' },
        { type: 'replace', text: 'Hello there' },
        { type: 'done' },
      ]),
  },
];

export async function runProtocolScenarioMatrix({ reveal = false } = {}) {
  const rows = [];
  let failures = 0;

  for (const scenario of PROTOCOL_SCENARIOS) {
    const events = [];
    const store = createSoftLlmStream({
      source: scenario.source(),
      adapter: scenario.adapter,
      reveal,
      onEvent(event) {
        events.push(event);
      },
    });

    const result = await store.start();
    const doneCount = events.filter((event) => event.type === 'done').length;
    const ok =
      result.status === 'done' &&
      result.text === scenario.expectedText &&
      doneCount === 1;

    if (!ok) {
      failures += 1;
    }

    rows.push({
      scenario: scenario.name,
      adapter: scenario.adapter,
      status: result.status,
      textLength: result.text.length,
      doneCount,
      ok,
    });
  }

  return {
    rows,
    passes: rows.length - failures,
    failures,
  };
}
