# Full lab summary

- generatedAt: 2026-05-02T10:50:20.555Z
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
- [x] client-update-density: balanced:91.4 | fastFirst:90.1 | softFinish:99.4

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
| balanced | 467.42 | 91.42 | 0 | 77.8 |
| fastFirst | 466.34 | 90.11 | 0 | 78.2 |
| softFinish | 475.7 | 99.38 | 0 | 148.4 |

## Perf

| profile | eventsPerSec | charsPerSec | samplesPerSec | usPerEvent | usPerFrame |
| --- | --- | --- | --- | --- | --- |
| balanced | 102651 | 2269243 | 497079 | 9.74 | 2.01 |
| fastFirst | 102331.9 | 2262190 | 491262 | 9.77 | 2.04 |
| softFinish | 109354.4 | 2417432 | 531676 | 9.14 | 1.88 |
