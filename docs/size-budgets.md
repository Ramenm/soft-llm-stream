# Size budgets

## Goals

- staged headless core runtime bundle (`package/dist/core.js`) must stay at or under **10 KiB gzip**
- staged npm tarball (`npm pack --dry-run --ignore-scripts ./package`) must stay at or under **12 KiB**

## Why the package is core-only

The source repo still contains wrappers, labs, reports, and additional validation code, but the publish artifact is intentionally narrowed to the headless runtime only. That keeps the external footprint small without deleting the internal verification surface.

## Commands

```bash
npm run build:lean
npm run size:check
npm run pack:check
```

`npm run lab:full` also refreshes `docs/assets/quality-card.svg`, so the README showcase card always tracks the latest full-lab report.

When local `terser` is unavailable, the repo now falls back to a checked-in lean-core artifact as long as its source hash still matches the current bundled runtime source. That keeps `lab:full`, `size:check`, and the release gate reproducible in a clean offline environment.

`npm run size:check` now also installs the packed tarball into a clean temporary consumer, executes a tiny runtime smoke flow there, and runs a strict TypeScript compile against the packaged declarations. That validates the published artifact as both installable code and a typed npm dependency.

## Confirmed results in this run

- `package/dist/core.js.gz = 9736 B`
- `package/dist/core.d.ts = 4865 B`
- `ramenm-soft-llm-stream-0.6.4.tgz = 11129 B`

## Implementation notes

- the repo keeps readable source and full labs
- the staged artifact is generated into `./package`
- the lean artifact path is self-checking through a source-bundle SHA-256 match
- the staged package contains `dist/core.js`, bundled `dist/core.d.ts`, a tiny `package.json`, and a tiny `README.md`
- the staged package omits DOM helpers and React helpers on purpose
- the release gate smoke-imports the staged package before packing
- the size check also smoke-installs and typechecks the packed tarball in a clean temporary consumer
