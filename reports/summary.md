# @ramenm/soft-llm-stream 0.6.5 — release summary

Generated: 2026-04-19T15:12:38Z

## Included

- source (`src/`), ready-to-run `dist/`, tests, examples, scripts, docs, CI workflow, and lab reports
- no `node_modules`, no `.git`, no OS junk, no staged publish folder

## Verified in this archive

- `tsc -p tsconfig.json --noEmit`
- `node --test --test-concurrency=1`
- `node ./scripts/full-lab.mjs`
- `node ./scripts/smoke-examples.mjs`
- `node ./scripts/check-lean-package.mjs`
- tests: 70/70 passed
- lab gates: 9/9 green
- core gzip: 9736 B
- bundled types: 4865 B
- tarball: 11129 B (`ramenm-soft-llm-stream-0.6.5.tgz`)
- consumer install smoke: `Hello world`
- consumer typecheck: `true`

## Current recommendations

- demo profile: `fastFirst`
- safest idle-gap profile: `fastFirst`
- idle-gap softness p95: 250ms=0.075, 750ms=0.147
- stress tail latency p95 (fastFirst): 418.3 ms

## Quick start

Quick verification without installing dependencies:

```bash
npm run check:quick
```

Demo server:

```bash
npm run demo:web:ready
```

A full rebuild from TypeScript sources still requires installing dependencies first.
