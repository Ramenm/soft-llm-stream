# Eval goals

This repo needs two separate but connected eval contracts:

1. **Transport correctness**
   - reconstruct the right final text
   - emit the right terminal state exactly once
   - avoid leaking control/meta payloads into visible text

2. **Reveal behavior under production-like arrival patterns**
   - avoid visible dumps after long idle gaps
   - keep first visible text responsive
   - avoid a giant completion snap at the tail
   - keep client update cost bounded

Current hard lesson from this regression: a smooth-looking demo is not enough. We need evals that can fail on the exact failure users complain about: a large delayed batch arriving after backlog was already drained, followed by one or two oversized visible jumps.

There is a second failure mode in the same family: the batch does not dump, but the reveal resumes so slowly after the gap that the user still perceives the UI as half-frozen. The eval surface should catch both extremes.

Metrics to report per scenario family:

- **accuracy / task success**
  - exact final text match
  - terminal status reached
  - exactly one completion signal
- **hallucination / unsupported-claim rate**
  - for transport-only cases: meta/tool/reasoning leakage into visible text
  - for any future answer-generation layer on top of this transport: unsupported claims must be scored separately and must never be hidden behind a single aggregate metric
- **abstention / uncertainty rate**
  - only relevant once a higher-level prompt/agent dataset is added; do not reward confident guessing over honest abstention
- **latency / cost**
  - `firstVisibleLagMs`
  - `completionLagMs`
  - `notificationsPer1kChars`
  - `visibleUpdatesPer1kChars`
- **flow-specific burst signals**
  - `maxFirstJumpShare`
  - `maxFirstThreeJumpShare`
  - `minUpdatesBeforeDrain`
  - early recovery shares after a long idle gap, for example visible share after roughly `250 ms` and `750 ms`
  - `maxAvoidableStallMs`
  - `completionSnapFactor`

# Scenario matrix

## Typical

Use cases that should reflect the common production path, not toy demos:

- append-only text streams with small and medium chunks
- provider-like SSE streams
- JSONL/NDJSON replace snapshots
- object-stream adapters from SDK iterators
- long prose answers with mixed chunk sizes
- code-heavy answers and markdown-heavy answers

Source preference:

- sanitized real logs first, when available and safe
- then historical bug traces
- then synthetic traces built to match observed chunk/gap distributions

## Edge

Cases that are valid but operationally uncomfortable:

- delayed first token
- cumulative snapshots after deltas
- text corrections after partial output already became visible
- long outputs in the `4k` to `50k`-token-ish range
- minute-scale idle windows
- large delayed batch after backlog was fully drained
- medium delayed batch after backlog was fully drained, where the risk is a near-frozen crawl instead of a dump
- large delayed batch after a replace/correction event
- multilingual and grapheme-dense outputs

## Adversarial

Cases designed to break assumptions:

- duplicate terminal markers
- malformed JSONL / partial SSE lines
- fragmented structured prefixes before stream type is obvious
- unknown event types
- tool/reasoning/meta frames mixed with text frames
- control fields like `id:` and `retry:` in SSE
- high jitter plus a few very large chunks
- traces that try to make the smoother look good on averages while still dumping in the first 1–3 updates

## Held-out

Keep a separate frozen set that is **not** used while tuning thresholds or prompt/tool behavior.

Recommended split:

- `typical/`
- `edge/`
- `adversarial/`
- `held-out/`
- `historical-regressions/`

Recommended policy:

- historical regressions may be used during tuning
- held-out cases may not
- whenever a new production incident appears, add one sanitized repro to `historical-regressions/` and one similar-but-not-identical case to `held-out/`

# Scoring rubric

## Good

A case is **good** only if all of the following hold:

- exact final text
- exactly one terminal completion
- no control/meta leakage into visible text
- no duplicate finalized snapshot appended after deltas
- no large delayed-batch dump according to the scenario threshold
- bounded client update cost for the chosen profile

For the delayed-large-batch regression family, the current hard thresholds in this repo are:

- `maxFirstJumpShare <= 0.12`
- `maxFirstThreeJumpShare <= 0.25`
- `minUpdatesBeforeDrain >= 10`

These thresholds are intentionally strict for the focused historical regressions and should stay narrow until real traffic calibration says otherwise.

For the related idle-gap recovery family, treat both extremes as failures:

- too much revealed in the first `~250 ms` means the recovery still looks dumpy on coarse render loops
- too little revealed by roughly the first `~750 ms` means the response still feels stuck after the wait

## Bad

A case is **bad** if correctness survives but user-visible behavior is still wrong enough to matter:

- final text is correct, but the delayed batch is dumped in too few updates
- completion is technically correct, but the tail snaps visibly
- text is correct, but notification/update cost is much higher than the baseline
- the case passes only because the corpus is too synthetic or the thresholds are too forgiving

## Unacceptable

A case is **unacceptable** if any of the following happen:

- wrong final text
- crash on a valid stream shape
- duplicated completion semantics
- tool/reasoning/meta payload rendered as answer text
- a focused historical delayed-batch repro regresses past the hard threshold

## How to score

Use more than one judgment mode:

- **binary checks** for exact text, terminal state, duplicate completion, and leakage
- **schema validation** for normalized event outputs where applicable
- **numeric thresholds** for burst, stall, latency, and client-cost metrics
- **pairwise comparison** only for cases where two strategies are both numerically acceptable but one still reads better
- **human calibration** on a small review set before changing thresholds

Do not collapse all of this into one opaque score.

# Dataset plan

## What exists in the repo now

Already present and useful:

- protocol fixtures in tests
- synthetic stress/long/extreme/idle corpora
- historical delayed-batch regression tests added in this revision
- runtime and simulated harnesses that expose smoothness and burst signals

## What is still missing

Not present in the uploaded archive, so still needed:

- sanitized production logs
- domain-expert examples labeled as acceptable / bad / unacceptable
- a frozen held-out set separated from tuning work
- answer-quality labels for any higher-level prompt/agent layer above this transport

## Recommended collection plan

1. **Scenario inventory**
   - map real request/stream shapes from logs
   - group by provider, adapter type, chunk distribution, gap distribution, and correction patterns

2. **Historical failures**
   - keep every real incident as a minimal repro
   - store the user-visible complaint next to the trace, not just the raw bytes

3. **Production-like corpus**
   - generate synthetic traces only after the real distributions are known
   - match first-token delays, chunk sizes, correction frequency, and idle gaps to observed traffic

4. **Held-out policy**
   - freeze a time-sliced or incident-sliced subset
   - do not tune on it

5. **Labeling**
   - binary correctness labels
   - numeric burst/cost metrics
   - expert rubric labels for borderline motion cases
   - unsupported-claim and abstention labels if the upstream feature actually generates answers

# Regression plan

## Per change to prompt / tool / model / reveal logic

Run the fast hard gate:

```bash
npm run typecheck
npm test
npm run lab:protocol
npm run lab:full
```

## Per change that touches reveal pacing or scheduling

Also run the targeted delayed-batch checks and keep the numeric output as an artifact:

```bash
node --input-type=module <<'__JS__'
import { runRealtimeTraceBenchmark } from './scripts/lib/smoothness-harness.mjs';

const traces = [
  {
    name: 'delay-300ms-batch-400chars',
    events: [
      { delayMs: 0, text: 'Hello' },
      { delayMs: 300, text: ' x'.repeat(200) },
    ],
  },
  {
    name: 'delay-3000ms-batch-1075chars',
    events: [
      { delayMs: 0, text: 'Hello' },
      { delayMs: 3000, text: ' This is a large batch after a long delay. '.repeat(25) },
    ],
  },
];

for (const trace of traces) {
  const result = await runRealtimeTraceBenchmark({ trace });
  console.log(trace.name, result.gapBurstMetrics);
}
__JS__
```

## Before release

Run broader labs, but do not confuse them with the historical hard gate:

```bash
npm run lab:stress
npm run lab:long
npm run lab:idle
npm run lab:client
```

## CI policy

- fail immediately on binary correctness regressions
- fail immediately on focused historical delayed-batch thresholds
- store metric JSON for comparison against the previous baseline
- review p95/p99 deltas by scenario family, not only globally
- keep one small human-calibration sample for threshold updates

# Main failure modes we will now catch

- stale reveal clock after backlog drained, followed by an oversized first reveal step
- delayed large batch dumped in 1–3 updates after a long pause
- exact final text correctness hiding a clearly bad visible replay
- transport tests passing while the user-visible motion still regresses
- unreliable regression loops caused by network-dependent test/build helpers
- flaky or invalid full-suite runs caused by parallel tests mutating `dist/`
- benchmark overfitting to synthetic averages instead of replaying historical incidents
- future higher-level evals rewarding confident guessing more than honest uncertainty
