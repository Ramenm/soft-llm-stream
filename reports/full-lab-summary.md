# Full lab summary

- generatedAt: 2026-05-02T10:35:26.494Z
- overallOk: true
- leanMinifier: terser
- sourceBundleSha256: 616bc9ff65cca1c7aef84b15f4d6ea36014bd23c02c52cebc28c6a890180d1f2

## Gates

- [x] protocol-matrix: 9/9 scenarios passed
- [x] lean-core-size: 9736/10240 bytes
- [x] lean-tarball-size: 11348/12288 bytes
- [x] lean-source-sync: terser:616bc9ff65cc
- [x] lean-tarball-install: ramenm-soft-llm-stream-0.6.5.tgz:Hello world
- [x] lean-tarball-types: ramenm-soft-llm-stream-0.6.5.tgz:typecheck=true
- [x] idle-gap-softness: balanced:250=0.076,750=0.147 | fastFirst:250=0.075,750=0.147 | softFinish:250=0.076,750=0.147
- [x] stress-tail-latency: balanced:482.5ms | fastFirst:418.3ms | softFinish:513.3ms
- [x] client-update-density: balanced:77.1 | fastFirst:91.1 | softFinish:100.2

## Size

- core gzip: 9736 / 10240
- bundled types: 4865 bytes
- tarball: 11348 / 12288
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
| balanced | 453.45 | 77.14 | 0 | 89.8 |
| fastFirst | 466.39 | 91.11 | 0 | 104.6 |
| softFinish | 476.29 | 100.16 | 0 | 137.4 |

## Perf

| profile | eventsPerSec | charsPerSec | samplesPerSec | usPerEvent | usPerFrame |
| --- | --- | --- | --- | --- | --- |
| balanced | 117073.9 | 2588081 | 566921 | 8.54 | 1.76 |
| fastFirst | 130555.2 | 2886105 | 626753 | 7.66 | 1.6 |
| softFinish | 132538.4 | 2929947 | 644395 | 7.54 | 1.55 |
