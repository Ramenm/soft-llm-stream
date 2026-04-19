# Showcase guide

## Best live-demo flow

1. start the browser demo with `npm run demo:web`
2. keep the default trace on `realistic-chat-short`
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

- `docs/assets/quality-card.svg`
- `docs/assets/overview.svg`
- `reports/full-lab-summary.md`
