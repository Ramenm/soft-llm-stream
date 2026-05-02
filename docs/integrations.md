# Integrations

`soft-llm-stream` works best when the transport layer stays honest about what is visible answer text and what is provider metadata.

## Confirmed stream families in this repo

These formats are explicitly covered by tests and the protocol lab in this revision:

- OpenAI Responses SSE (`response.output_text.delta`, `response.output_text.done`)
- OpenAI legacy Chat Completions SSE (`chat.completion.chunk` + optional usage trailer)
- Anthropic Messages SSE (`message_start`, `content_block_delta`, `message_stop`)
- Vercel AI SDK UI/data streams (`text-delta`, `finish`, related typed parts)
- normalized JSONL / NDJSON event streams
- direct object-event streams passed to the `event` adapter

## What the adapters do

### Text-bearing events

These become visible answer text:

- append deltas like OpenAI `response.output_text.delta`
- cumulative snapshots or corrected text through `replace`
- provider payloads whose structured text can be extracted safely

### Meta-only events

These stay in `snapshot.meta` and do **not** become visible answer text:

- thinking / progress / search phases
- tool or reasoning side-channel events
- usage trailers and provider bookkeeping payloads
- transport-only SSE fields like `id:` and `retry:`

## Recommended backend contract

If you control the backend, the most stable cross-provider shape is still the normalized event contract from [`transport-contract.md`](./transport-contract.md):

- `text`
- `replace`
- `meta`
- `done`

Provider-native SSE is supported directly, but normalized events stay easier to reason about, test, and replay.
