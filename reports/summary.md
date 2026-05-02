# @ramenm/soft-llm-stream 0.6.5 — current verification summary

Generated: 2026-05-02T10:35:43Z

## Included

- source (`src/`), ready-to-run `dist/`, tests, examples, scripts, docs, CI workflow, and lab reports
- no `node_modules` requirement for the archive quick path as long as checked-in `dist/` is present
- no additional app-level job-search product code; this repo is the stream-smoothing library itself

## Verified in this run

- `npm run showcase:check --silent`
- tests: **80/80** passed
- protocol matrix: **9/9** scenarios passed
- full-lab gates: **9/9** green
- staged core gzip: **9736 B**
- bundled types: **4865 B**
- staged tarball: **11348 B** (`ramenm-soft-llm-stream-0.6.5.tgz`)
- consumer install smoke: `Hello world`
- consumer typecheck: `true`

## Notable confirmations

- package smoke no longer depends on an executable `.bin/tsc` shim
- demo browser server rejects same-prefix sibling traversal attempts
- explicit compatibility coverage now includes legacy OpenAI Chat Completions SSE in addition to Responses, Anthropic Messages, AI SDK data streams, JSONL, and direct event streams

## Current recommendations

- demo profile: `fastFirst`
- safest idle-gap profile: `fastFirst`
- idle-gap softness p95: `250ms=0.075`, `750ms=0.147`
- stress tail latency p95 (`fastFirst`): `418.3 ms`

## Quick start

Fast verification from this repo tree:

```bash
npm run check:quick
```

Full validation:

```bash
npm install
npm run showcase:check
```
