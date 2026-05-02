# Showcase guide

## Best live-demo flow

1. start the browser demo with `npm run demo:web`
2. keep the default trace on `showcase-chat`
3. keep the default profile on `fastFirst`
4. point out the summary strip before restarting the run
5. restart once so viewers can watch both panes from the top

## What to call out

- the left pane waits, then dumps visible text in larger jumps
- the right pane uses the same arrivals but spreads them into steadier visible motion
- the summary strip quantifies the difference without making people read every metric table
- the package is tiny because the publish artifact is core-only, while the repo keeps the full validation surface

## Best claims to make from this revision

- headless runtime only in the published package
- validated against protocol, stress, idle-gap, client-cost, and size gates
- reproducible lean-package path even when local minification is unavailable
- executable examples for event streams and HTTP JSONL flows

## Suggested assets for a README, post, or demo page

- `docs/assets/demo-recording.gif`
- `docs/assets/overview.svg`
- `reports/full-lab-summary.md`

Regenerate the live browser recording with:

```bash
npm run docs:record-demo
```

The recorder defaults to `--mode=client`, which uses `showcase-chat`: the best
client-facing trace because it shows the real problem (chunky chat batches), the
core value (smaller visible jumps), live metrics, and enough content to auto-scroll
without turning into a synthetic stress test.

By default the recorder writes only the README GIF; temporary encoder files stay
under `.omx/recordings/` and are not part of the public showcase.

Other useful recording modes:

- `--mode=client` — best README/client asset; short chat, readable copy, clear metrics.
- `--mode=scroll` — long-output proof; use when you need to show internal pane scrolling.
- `--mode=gap` — tool-call stall proof; use when you want the freeze/recovery story.
- `--mode=slow` — slow real-chat proof; use for painful 3-7 second frontend waits.

Override it when needed, for example:

```bash
npm run docs:record-demo -- --mode=scroll
npm run docs:record-demo -- --mode=gap
npm run docs:record-demo -- --trace=realistic-chat-short --duration-ms=16000
```
