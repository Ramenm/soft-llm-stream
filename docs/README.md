# soft-llm-stream setup and validation

## Quick start

```bash
npm install
npm run typecheck
npm test
npm run lab:protocol
npm run lab:full
npm run examples:smoke
```

`lab:full` writes the current showcase summary into:

- `reports/full-lab-summary.json`
- `reports/full-lab-summary.md`

## One-command showcase check

```bash
npm run showcase:check
```

That covers typecheck, tests, protocol validation, the full lab, executable examples, and size budgets.

## Integration coverage

Provider and transport compatibility that is explicitly checked in this revision lives in [`docs/integrations.md`](./integrations.md).

## Focused delayed-gap check

Use this when you touch reveal pacing and want one targeted repro in addition to the full lab:

```bash
node --input-type=module <<'__JS__'
import { runRealtimeTraceBenchmark } from './scripts/lib/smoothness-harness.mjs';

const result = await runRealtimeTraceBenchmark({
  trace: {
    name: 'delayed-large-batch',
    events: [
      { delayMs: 0, text: 'Hello' },
      { delayMs: 300, text: ' x'.repeat(200) },
    ],
  },
});

console.log(result.gapBurstMetrics);
__JS__
```

## Notes

- keep `node --test` serialized for this repo because `test/ensure-dist.test.mjs` temporarily moves `dist/`
- the lean-package path is reproducible without a local minifier if the checked-in fallback hash still matches the current bundled source
- the browser demo includes a live comparison summary strip so the page is easier to show in meetings and recordings
