# Examples

- `basic-event-stream.mjs` — normalized object events through the `event` adapter
- `response-jsonl.mjs` — simulated HTTP `Response` with JSONL / NDJSON lines and `adapter: "auto"`
- `phase-aware-chat.mjs` — portable `meta.phase` side-channel with visible `text` and `replace`

Smoke-check them all with:

```bash
npm run examples:smoke
```
