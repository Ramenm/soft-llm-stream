# Full lab summary

- generatedAt: 2026-04-19T15:11:33.777Z
- overallOk: true
- leanMinifier: prebuilt-fallback
- sourceBundleSha256: 616bc9ff65cca1c7aef84b15f4d6ea36014bd23c02c52cebc28c6a890180d1f2

## Gates

- [x] protocol-matrix: 8/8 scenarios passed
- [x] lean-core-size: 9736/10240 bytes
- [x] lean-tarball-size: 11129/12288 bytes
- [x] lean-source-sync: prebuilt-fallback:616bc9ff65cc
- [x] lean-tarball-install: ramenm-soft-llm-stream-0.6.5.tgz:Hello world
- [x] lean-tarball-types: ramenm-soft-llm-stream-0.6.5.tgz:typecheck=true
- [x] idle-gap-softness: balanced:250=0.076,750=0.147 | fastFirst:250=0.075,750=0.147 | softFinish:250=0.076,750=0.147
- [x] stress-tail-latency: balanced:482.5ms | fastFirst:418.3ms | softFinish:513.3ms
- [x] client-update-density: balanced:34.3 | fastFirst:34.3 | softFinish:36.1

## Size

- core gzip: 9736 / 10240
- bundled types: 4865 bytes
- tarball: 11129 / 12288
- consumer install smoke: Hello world (ramenm-soft-llm-stream-0.6.5.tgz)
- consumer typecheck: true

## Suggested defaults

- demo/profile: fastFirst
- safest idle-gap profile: fastFirst

## Benchmark profiles

| profile | velocityCvP95 | completionSnapP95 | completionLagP95 | firstVisibleLagP95 | bandCoverageMean |
| --- | --- | --- | --- | --- | --- |
| balanced | 0.933 | 6.527 | 390 | 0 | 0.875 |
| fastFirst | 0.933 | 6.492 | 381.7 | 0 | 0.883 |
| softFinish | 0.896 | 6.566 | 420 | 0 | 0.88 |

## Idle-gap profiles

| profile | shareAfter250MsP95 | shareAfter750MsP95 | shareAfter750MsMin | completionLagP95 |
| --- | --- | --- | --- | --- |
| balanced | 0.076 | 0.147 | 0.147 | 2062.5 |
| fastFirst | 0.075 | 0.147 | 0.147 | 1850 |
| softFinish | 0.076 | 0.147 | 0.147 | 2062.5 |

## Client update cost

| profile | notificationsPer1kCharsP95 | visibleUpdatesPer1kCharsP95 | firstVisibleLagP95 | completionLagP95 |
| --- | --- | --- | --- | --- |
| balanced | 394.67 | 34.34 | 0 | 324 |
| fastFirst | 393.96 | 34.34 | 0 | 303 |
| softFinish | 396.78 | 36.13 | 0 | 385.7 |

## Perf

| profile | eventsPerSec | charsPerSec | samplesPerSec | usPerEvent | usPerFrame |
| --- | --- | --- | --- | --- | --- |
| balanced | 61343.7 | 1356088 | 297052 | 16.3 | 3.37 |
| fastFirst | 129099.9 | 2853933 | 619766 | 7.75 | 1.61 |
| softFinish | 126765.8 | 2802336 | 616329 | 7.89 | 1.62 |
