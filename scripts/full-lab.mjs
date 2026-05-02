import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  DEFAULT_REVEAL_TUNING,
  FAST_FIRST_REVEAL_TUNING,
  SOFT_FINISH_REVEAL_TUNING,
  simulateTrace,
} from '../dist/internal.js';
import { summarizeTrace } from './lib/random-trace.mjs';
import {
  buildBenchmarkCorpus,
  buildIdleGapBenchmarkCorpus,
  buildLongOutputBenchmarkCorpus,
  buildStressCorpus,
} from './lib/trace-corpus.mjs';
import {
  runRealtimeTraceBenchmark,
  runSimulatedTraceBenchmark,
} from './lib/smoothness-harness.mjs';
import { runProtocolScenarioMatrix } from './lib/protocol-lab.mjs';
import {
  CORE_RUNTIME_GZIP_BUDGET_BYTES,
  CORE_TARBALL_BUDGET_BYTES,
  buildLeanPackage,
  isPrebuiltLeanFallbackInSync,
  packLeanPackage,
  smokeImportLeanCore,
  smokeInstallLeanTarball,
} from './lib/lean-package.mjs';

const PROFILE_MAP = {
  balanced: DEFAULT_REVEAL_TUNING,
  fastFirst: FAST_FIRST_REVEAL_TUNING,
  softFinish: SOFT_FINISH_REVEAL_TUNING,
};

function mean(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, ratio) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * Math.max(0, Math.min(1, ratio));
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower];
  }

  const remainder = index - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * remainder;
}

function round(value, digits = 1) {
  return Number(value.toFixed(digits));
}

function formatProfileRow(row, keys) {
  return `| ${keys.map((key) => row[key]).join(" | ")} |`;
}

function buildTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => formatProfileRow(row, headers)),
  ];
}

function ensureReportsDir() {
  const reportsDir = path.resolve('reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  return reportsDir;
}

function measureHeapMb() {
  if (typeof global.gc === 'function') {
    global.gc();
  }
  return process.memoryUsage().heapUsed / (1024 * 1024);
}

function summarizeCoverage(traces) {
  const stats = traces.map((trace) => summarizeTrace(trace));
  return {
    traces: traces.length,
    charsMean: mean(stats.map((row) => row.totalChars)),
    charsP95: percentile(stats.map((row) => row.totalChars), 0.95),
    chunkCountMean: mean(stats.map((row) => row.chunkCount)),
    meanChunkCharsMean: mean(stats.map((row) => row.meanChunkChars)),
    p90ChunkCharsP95: percentile(stats.map((row) => row.p90ChunkChars), 0.95),
    durationMsP95: percentile(stats.map((row) => row.totalDurationMs), 0.95),
  };
}

async function summarizeSimulatedProfiles({ traces, frameMs = undefined, includeIdleWindows = false }) {
  const rows = [];

  for (const [profile, tuning] of Object.entries(PROFILE_MAP)) {
    const metrics = [];
    const gapMetrics = [];

    for (const trace of traces) {
      const result = await runSimulatedTraceBenchmark({ trace, tuning, frameMs });
      metrics.push(result.metrics);
      gapMetrics.push(result.gapBurstMetrics);
    }

    const delayedCases = gapMetrics.reduce(
      (sum, row) => sum + row.delayedLargeBatchCount,
      0,
    );
    const gapRows250 = gapMetrics.filter((row) => row.shareAfter250MsCaseCount > 0);
    const gapRows750 = gapMetrics.filter((row) => row.shareAfter750MsCaseCount > 0);

    rows.push({
      profile,
      traces: traces.length,
      velocityCvMean: mean(metrics.map((row) => row.velocityCv)),
      velocityCvP95: percentile(metrics.map((row) => row.velocityCv), 0.95),
      completionSnapP95: percentile(
        metrics.map((row) => row.completionSnapFactor),
        0.95,
      ),
      completionLagP95: percentile(metrics.map((row) => row.completionLagMs), 0.95),
      firstVisibleLagP95: percentile(
        metrics.map((row) => row.firstVisibleLagMs),
        0.95,
      ),
      maxAvoidableStallP95: percentile(
        metrics.map((row) => row.maxAvoidableStallMs),
        0.95,
      ),
      bandCoverageMean: mean(
        metrics.map((row) => row.backlogHorizonBandCoverage),
      ),
      delayedCases,
      firstJumpShareP95:
        delayedCases > 0
          ? percentile(gapMetrics.map((row) => row.maxFirstJumpShare), 0.95)
          : 0,
      firstThreeJumpShareP95:
        delayedCases > 0
          ? percentile(gapMetrics.map((row) => row.maxFirstThreeJumpShare), 0.95)
          : 0,
      ...(includeIdleWindows
        ? {
            shareAfter250MsP95:
              gapRows250.length > 0
                ? percentile(gapRows250.map((row) => row.maxShareAfter250Ms), 0.95)
                : 0,
            shareAfter750MsP95:
              gapRows750.length > 0
                ? percentile(gapRows750.map((row) => row.maxShareAfter750Ms), 0.95)
                : 0,
            shareAfter750MsMin:
              gapRows750.length > 0
                ? Math.min(...gapRows750.map((row) => row.minShareAfter750Ms))
                : 0,
          }
        : {}),
    });
  }

  return rows;
}

function scaleTraceDelays(trace, delayScale) {
  return {
    ...trace,
    events: trace.events.map((event) => ({
      ...event,
      delayMs: Math.max(0, Math.round((Number(event.delayMs) || 0) * delayScale)),
    })),
  };
}

async function summarizeClientCost({ traceCount = 4, delayScale = 0.08, frameMs = 1000 / 60 }) {
  const traces = buildStressCorpus({ count: traceCount }).map((trace) =>
    scaleTraceDelays(trace, delayScale),
  );
  const rows = [];

  for (const [profile, tuning] of Object.entries(PROFILE_MAP)) {
    const results = [];
    for (const trace of traces) {
      results.push(await runRealtimeTraceBenchmark({ trace, tuning, frameMs }));
    }

    rows.push({
      profile,
      traces: traces.length,
      chars: results.reduce((sum, row) => sum + row.finalSnapshot.text.length, 0),
      notificationsPer1kCharsMean: mean(
        results.map((row) => row.runtimeCost.notificationsPer1kChars),
      ),
      notificationsPer1kCharsP95: percentile(
        results.map((row) => row.runtimeCost.notificationsPer1kChars),
        0.95,
      ),
      visibleUpdatesPer1kCharsMean: mean(
        results.map((row) => row.runtimeCost.visibleUpdatesPer1kChars),
      ),
      visibleUpdatesPer1kCharsP95: percentile(
        results.map((row) => row.runtimeCost.visibleUpdatesPer1kChars),
        0.95,
      ),
      firstVisibleLagP95: percentile(
        results.map((row) => row.metrics.firstVisibleLagMs),
        0.95,
      ),
      completionLagP95: percentile(
        results.map((row) => row.metrics.completionLagMs),
        0.95,
      ),
    });
  }

  return {
    traceCount,
    delayScale,
    frameMs,
    rows,
  };
}

function runPerfBatch(traces, tuning, rounds, frameMs) {
  let totalEvents = 0;
  let totalChars = 0;
  let totalSamples = 0;
  const startedAt = performance.now();

  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    for (const trace of traces) {
      const result = simulateTrace({ trace, tuning, frameMs });
      totalEvents += trace.events.length;
      totalChars += result.finalText.length;
      totalSamples += result.samples.length;
    }
  }

  const elapsedMs = performance.now() - startedAt;
  return {
    traces: traces.length * rounds,
    events: totalEvents,
    chars: totalChars,
    samples: totalSamples,
    elapsedMs,
    eventsPerSec: totalEvents / Math.max(0.001, elapsedMs / 1000),
    charsPerSec: totalChars / Math.max(0.001, elapsedMs / 1000),
    samplesPerSec: totalSamples / Math.max(0.001, elapsedMs / 1000),
    microsecondsPerEvent: (elapsedMs * 1000) / Math.max(1, totalEvents),
    microsecondsPerFrame: (elapsedMs * 1000) / Math.max(1, totalSamples),
  };
}

function summarizePerf({ traces, rounds = 2, frameMs = 1000 / 60 }) {
  const beforeHeapMb = measureHeapMb();
  const rows = [];

  for (const [profile, tuning] of Object.entries(PROFILE_MAP)) {
    rows.push({
      profile,
      ...runPerfBatch(traces, tuning, rounds, frameMs),
    });
  }

  const afterHeapMb = measureHeapMb();
  return {
    rounds,
    frameMs,
    heapDeltaMb: afterHeapMb - beforeHeapMb,
    rows,
  };
}

function buildMarkdownReport(summary) {
  const benchmarkTable = buildTable(
    ["profile", "velocityCvP95", "completionSnapP95", "completionLagP95", "firstVisibleLagP95", "bandCoverageMean"],
    summary.benchmarkProfiles.map((row) => ({
      profile: row.profile,
      velocityCvP95: round(row.velocityCvP95, 3),
      completionSnapP95: round(row.completionSnapP95, 3),
      completionLagP95: round(row.completionLagP95, 1),
      firstVisibleLagP95: round(row.firstVisibleLagP95, 1),
      bandCoverageMean: round(row.bandCoverageMean, 3),
    })),
  );

  const idleTable = buildTable(
    ["profile", "shareAfter250MsP95", "shareAfter750MsP95", "shareAfter750MsMin", "completionLagP95"],
    summary.idleProfiles.map((row) => ({
      profile: row.profile,
      shareAfter250MsP95: round(row.shareAfter250MsP95, 3),
      shareAfter750MsP95: round(row.shareAfter750MsP95, 3),
      shareAfter750MsMin: round(row.shareAfter750MsMin, 3),
      completionLagP95: round(row.completionLagP95, 1),
    })),
  );

  const clientTable = buildTable(
    ["profile", "notificationsPer1kCharsP95", "visibleUpdatesPer1kCharsP95", "firstVisibleLagP95", "completionLagP95"],
    summary.client.rows.map((row) => ({
      profile: row.profile,
      notificationsPer1kCharsP95: round(row.notificationsPer1kCharsP95, 2),
      visibleUpdatesPer1kCharsP95: round(row.visibleUpdatesPer1kCharsP95, 2),
      firstVisibleLagP95: round(row.firstVisibleLagP95, 1),
      completionLagP95: round(row.completionLagP95, 1),
    })),
  );

  const perfTable = buildTable(
    ["profile", "eventsPerSec", "charsPerSec", "samplesPerSec", "usPerEvent", "usPerFrame"],
    summary.performance.rows.map((row) => ({
      profile: row.profile,
      eventsPerSec: round(row.eventsPerSec, 1),
      charsPerSec: round(row.charsPerSec, 0),
      samplesPerSec: round(row.samplesPerSec, 0),
      usPerEvent: round(row.microsecondsPerEvent, 2),
      usPerFrame: round(row.microsecondsPerFrame, 2),
    })),
  );

  return [
    "# Full lab summary",
    "",
    `- generatedAt: ${summary.generatedAt}`,
    `- overallOk: ${summary.gates.every((row) => row.ok)}`,
    `- leanMinifier: ${summary.size.minifier}`,
    `- sourceBundleSha256: ${summary.size.sourceBundleSha256}`,
    "",
    "## Gates",
    "",
    ...summary.gates.map((row) => `- [${row.ok ? "x" : " "}] ${row.name}: ${row.detail}`),
    "",
    "## Size",
    "",
    `- core gzip: ${summary.size.coreGzipBytes} / ${CORE_RUNTIME_GZIP_BUDGET_BYTES}`,
    `- bundled types: ${summary.size.coreTypesBytes} bytes`,
    `- tarball: ${summary.size.tarballBytes} / ${CORE_TARBALL_BUDGET_BYTES}`,
    `- consumer install smoke: ${summary.size.consumerSmokeText} (${summary.size.consumerTarballName})`,
    `- consumer typecheck: ${summary.size.consumerTypecheckOk}`,
    "",
    "## Suggested defaults",
    "",
    `- demo/profile: ${summary.recommendations.demoProfile}`,
    `- safest idle-gap profile: ${summary.recommendations.idleSoftnessProfile}`,
    "",
    "## Benchmark profiles",
    "",
    ...benchmarkTable,
    "",
    "## Idle-gap profiles",
    "",
    ...idleTable,
    "",
    "## Client update cost",
    "",
    ...clientTable,
    "",
    "## Perf",
    "",
    ...perfTable,
    "",
  ].join("\n");
}


async function main() {
  const benchmarkTraces = await buildBenchmarkCorpus();
  const stressTraces = buildStressCorpus({ count: Math.max(12, Number(process.env.FULL_LAB_STRESS_COUNT) || 24) });
  const longTraces = buildLongOutputBenchmarkCorpus({ scale: Math.max(1, Number(process.env.FULL_LAB_LONG_SCALE) || 1) });
  const idleTraces = buildIdleGapBenchmarkCorpus({
    targetTokens: Math.max(1000, Number(process.env.FULL_LAB_IDLE_TOKENS) || 26000),
    scale: Math.max(0.1, Number(process.env.FULL_LAB_IDLE_SCALE) || 1),
  });
  const idleFrameMs = Math.max(16, Number(process.env.FULL_LAB_IDLE_FRAME_MS) || 250);

  const [protocol, benchmarkProfiles, stressProfiles, longProfiles, idleProfiles, client, leanPackage] = await Promise.all([
    runProtocolScenarioMatrix(),
    summarizeSimulatedProfiles({ traces: benchmarkTraces }),
    summarizeSimulatedProfiles({ traces: stressTraces }),
    summarizeSimulatedProfiles({ traces: longTraces }),
    summarizeSimulatedProfiles({ traces: idleTraces, frameMs: idleFrameMs, includeIdleWindows: true }),
    summarizeClientCost({
      traceCount: Math.max(3, Number(process.env.FULL_LAB_CLIENT_TRACES) || 3),
      delayScale: Math.max(0.05, Number(process.env.FULL_LAB_CLIENT_DELAY_SCALE) || 0.08),
    }),
    (async () => {
      const metrics = await buildLeanPackage();
      const packInfo = packLeanPackage();
      const smoke = await smokeImportLeanCore();
      const consumerSmoke = await smokeInstallLeanTarball();
      return {
        sizeMetrics: {
          coreGzipBytes: metrics.coreGzipBytes,
          coreTypesBytes: metrics.coreTypesBytes,
          tarballBytes: packInfo.size,
          coreWithinBudget: metrics.coreGzipBytes <= CORE_RUNTIME_GZIP_BUDGET_BYTES,
          tarballWithinBudget: packInfo.size <= CORE_TARBALL_BUDGET_BYTES,
          tarballName: packInfo.filename,
          minifier: metrics.minifier,
          sourceBundleSha256: metrics.sourceBundleSha256,
          fallbackBundleSha256: metrics.fallbackBundleSha256,
          fallbackInSync: isPrebuiltLeanFallbackInSync(),
        },
        smoke,
        consumerSmoke,
      };
    })(),
  ]);

  const { sizeMetrics, smoke, consumerSmoke } = leanPackage;

  const perf = summarizePerf({
    traces: stressTraces.slice(0, Math.max(6, Number(process.env.FULL_LAB_PERF_TRACES) || 8)),
    rounds: Math.max(1, Number(process.env.FULL_LAB_PERF_ROUNDS) || 1),
  });

  const gates = [
    {
      name: 'protocol-matrix',
      ok: protocol.failures === 0,
      detail: `${protocol.passes}/${protocol.rows.length} scenarios passed`,
    },
    {
      name: 'lean-core-size',
      ok: sizeMetrics.coreWithinBudget,
      detail: `${sizeMetrics.coreGzipBytes}/${CORE_RUNTIME_GZIP_BUDGET_BYTES} bytes`,
    },
    {
      name: 'lean-tarball-size',
      ok: sizeMetrics.tarballWithinBudget,
      detail: `${sizeMetrics.tarballBytes}/${CORE_TARBALL_BUDGET_BYTES} bytes`,
    },
    {
      name: 'lean-source-sync',
      ok: sizeMetrics.fallbackInSync,
      detail: `${sizeMetrics.minifier}:${String(sizeMetrics.sourceBundleSha256).slice(0, 12)}`,
    },
    {
      name: 'lean-tarball-install',
      ok: consumerSmoke.snapshot.text === 'Hello world',
      detail: `${consumerSmoke.packInfo.filename}:${consumerSmoke.snapshot.text}`,
    },
    {
      name: 'lean-tarball-types',
      ok: consumerSmoke.typecheckOk === true,
      detail: `${consumerSmoke.packInfo.filename}:typecheck=${consumerSmoke.typecheckOk}`,
    },
    {
      name: 'idle-gap-softness',
      ok: idleProfiles.every((row) => row.shareAfter250MsP95 <= 0.09 && row.shareAfter750MsP95 <= 0.2),
      detail: idleProfiles
        .map((row) => `${row.profile}:250=${round(row.shareAfter250MsP95, 3)},750=${round(row.shareAfter750MsP95, 3)}`)
        .join(' | '),
    },
    {
      name: 'stress-tail-latency',
      ok: stressProfiles.every((row) => row.completionLagP95 <= 650),
      detail: stressProfiles
        .map((row) => `${row.profile}:${round(row.completionLagP95, 1)}ms`)
        .join(' | '),
    },
    {
      name: 'client-update-density',
      ok: client.rows.every((row) => row.visibleUpdatesPer1kCharsP95 <= 180),
      detail: client.rows
        .map((row) => `${row.profile}:${round(row.visibleUpdatesPer1kCharsP95, 1)}`)
        .join(' | '),
    },
  ];

  const recommendations = {
    demoProfile: [...benchmarkProfiles]
      .sort((left, right) => {
        if (left.completionLagP95 !== right.completionLagP95) {
          return left.completionLagP95 - right.completionLagP95;
        }
        return left.firstVisibleLagP95 - right.firstVisibleLagP95;
      })[0]?.profile ?? 'fastFirst',
    idleSoftnessProfile: [...idleProfiles]
      .sort((left, right) => {
        if (left.shareAfter250MsP95 !== right.shareAfter250MsP95) {
          return left.shareAfter250MsP95 - right.shareAfter250MsP95;
        }
        return left.shareAfter750MsP95 - right.shareAfter750MsP95;
      })[0]?.profile ?? 'balanced',
  };

  const summary = {
    generatedAt: new Date().toISOString(),
    coverage: {
      benchmark: summarizeCoverage(benchmarkTraces),
      stress: summarizeCoverage(stressTraces),
      long: summarizeCoverage(longTraces),
      idle: {
        ...summarizeCoverage(idleTraces),
        frameMs: idleFrameMs,
      },
    },
    protocol,
    benchmarkProfiles,
    stressProfiles,
    longProfiles,
    idleProfiles,
    client,
    performance: perf,
    size: {
      ...sizeMetrics,
      smokeText: smoke.snapshot.text,
      coreExports: smoke.coreExports,
      consumerSmokeText: consumerSmoke.snapshot.text,
      consumerTypecheckOk: consumerSmoke.typecheckOk,
      consumerExports: consumerSmoke.coreExports,
      consumerTarballName: consumerSmoke.packInfo.filename,
      consumerTarballBytes: consumerSmoke.packInfo.size,
    },
    recommendations,
    gates,
  };

  console.table(protocol.rows);
  console.table(
    benchmarkProfiles.map((row) => ({
      profile: row.profile,
      velocityCvP95: round(row.velocityCvP95, 3),
      completionSnapP95: round(row.completionSnapP95, 3),
      completionLagP95: round(row.completionLagP95, 1),
      firstVisibleLagP95: round(row.firstVisibleLagP95, 1),
      bandCoverageMean: round(row.bandCoverageMean, 3),
    })),
  );
  console.table(
    idleProfiles.map((row) => ({
      profile: row.profile,
      frameMs: idleFrameMs,
      delayedCases: row.delayedCases,
      firstJumpShareP95: round(row.firstJumpShareP95, 3),
      firstThreeJumpShareP95: round(row.firstThreeJumpShareP95, 3),
      shareAfter250MsP95: round(row.shareAfter250MsP95, 3),
      shareAfter750MsP95: round(row.shareAfter750MsP95, 3),
      shareAfter750MsMin: round(row.shareAfter750MsMin, 3),
      completionLagP95: round(row.completionLagP95, 1),
    })),
  );
  console.table(
    client.rows.map((row) => ({
      profile: row.profile,
      traces: row.traces,
      notificationsPer1kCharsP95: round(row.notificationsPer1kCharsP95, 2),
      visibleUpdatesPer1kCharsP95: round(row.visibleUpdatesPer1kCharsP95, 2),
      firstVisibleLagP95: round(row.firstVisibleLagP95, 1),
      completionLagP95: round(row.completionLagP95, 1),
    })),
  );
  console.table(
    perf.rows.map((row) => ({
      profile: row.profile,
      traces: row.traces,
      eventsPerSec: round(row.eventsPerSec, 1),
      charsPerSec: round(row.charsPerSec, 0),
      samplesPerSec: round(row.samplesPerSec, 0),
      usPerEvent: round(row.microsecondsPerEvent, 2),
      usPerFrame: round(row.microsecondsPerFrame, 2),
    })),
  );
  console.table(gates);
  console.log(JSON.stringify(summary, null, 2));

  const reportsDir = ensureReportsDir();
  fs.writeFileSync(
    path.join(reportsDir, 'full-lab-summary.json'),
    JSON.stringify(summary, null, 2),
  );
  fs.writeFileSync(
    path.join(reportsDir, 'full-lab-summary.md'),
    buildMarkdownReport(summary),
  );
}

await main();
