# Transport contract

This library works best when the producer tells the truth about stream semantics.

The reveal layer is text-first. It can smooth how text becomes visible, but it cannot guess whether an upstream frame is:

- a true append delta
- a cumulative snapshot
- a correction of already emitted text
- metadata only
- a terminal completion marker

## Normalized event model

The smallest portable contract is:

```ts
type StreamEvent =
  | { type: "text"; text: string }
  | { type: "replace"; text: string }
  | { type: "meta"; data: Record<string, unknown> }
  | { type: "done" }
  | { type: "error"; error: unknown };
```

## Meaning of each event

### `text`

Use `text` only when the incoming data is a true append delta.

Example:

```json
{"type":"text","text":" world"}
```

If the current full text is `Hello`, the next full text becomes `Hello world`.

### `replace`

Use `replace` when the new frame is the whole text snapshot, or when the upstream corrected previous text.

Example:

```json
{"type":"replace","text":"Hello world"}
```

If the current full text is `Hel`, the next full text becomes exactly `Hello world`.

### `meta`

Use `meta` for structured side-channel data that should not be appended to user-visible text.

Typical examples:

- `{"phase":"thinking"}` before the first visible text
- `{"phase":"tool"}` or `{"phase":"searching"}` during a long backend gap
- `{"model":"...","traceId":"..."}` for diagnostics that the renderer may ignore

For user-facing chat UIs, `meta.phase` is the easiest way to avoid a blank frozen screen during long waits between text batches.

### `done`

Marks terminal completion.

### `error`

Stops the stream with an error.

## Recommended mappings

### Plain append-only text

Use adapter `text`.

### SSE over HTTP

Use adapter `sse` and send either:

- raw provider SSE events that the built-in normalizer already understands, or
- your own normalized JSON objects in `data:` lines

Standard SSE control fields like `id:` and `retry:` are safe; they are treated as transport metadata and never appended to visible text.

### JSONL / NDJSON

Use adapter `jsonl` and emit one JSON object per line.

### SDK async iterables / object streams

Use adapter `event` and yield event objects directly.

## CLI-friendly JSONL example

```jsonl
{"type":"meta","data":{"phase":"thinking"}}
{"type":"text","text":"Hel"}
{"type":"replace","text":"Hello"}
{"type":"meta","data":{"phase":"tool"}}
{"type":"replace","text":"Hello world"}
{"type":"done"}
```

This same JSONL shape works well for:

- browser frontends consuming streamed fetch responses
- CLI tools piping model output through stdout
- other packages that want a stable cross-runtime contract without bringing in DOM-specific helpers

## SSE example

```text
event: message
data: {"type":"text","text":"Hel"}

event: message
data: {"type":"replace","text":"Hello"}

event: message
data: {"type":"replace","text":"Hello world"}

event: done
data: {"type":"done"}
```

## Object-stream example

```ts
async function* stream() {
  yield { type: "text", text: "Hel" };
  yield { type: "replace", text: "Hello" };
  yield { type: "done" };
}
```

## Design rule

Never lie to the reveal layer.

If the upstream sends snapshots, use `replace`.
If it sends deltas, use `text`.
If it sends tools, reasoning, or progress data, keep that in `meta`.

That one rule removes most real-world duplication and snap bugs.

One more practical rule for natural motion:

- when the frontend only receives larger buffered batches, send those real batches as-is and let the reveal layer smooth them
- do not pre-split a buffered paragraph into fake token drips just to imitate typing

## Auto detection note

`adapter: "auto"` now buffers a short prefix before deciding, so fragmented SSE and JSONL headers do not get misclassified as plain text on the first tiny chunk.
