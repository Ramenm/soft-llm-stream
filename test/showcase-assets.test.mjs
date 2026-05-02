import assert from 'node:assert/strict';
import test from 'node:test';

import { renderQualityCardSvg } from '../scripts/lib/showcase-assets.mjs';

test('quality card renderer includes the main showcase metrics', () => {
  const svg = renderQualityCardSvg({
    generatedAt: '2026-04-19T12:00:00.000Z',
    recommendations: {
      demoProfile: 'fastFirst',
      idleSoftnessProfile: 'balanced',
    },
    size: {
      coreGzipBytes: 9736,
    },
    benchmarkProfiles: [
      { profile: 'fastFirst', completionLagP95: 418.3 },
    ],
    idleProfiles: [
      { profile: 'balanced', shareAfter250MsP95: 0.075, shareAfter750MsP95: 0.147 },
    ],
    gates: [
      { ok: true },
      { ok: true },
      { ok: true },
      { ok: true },
    ],
  });

  assert.match(svg, /soft-llm-stream/);
  assert.match(svg, /fastFirst/);
  assert.match(svg, /9736 bytes/);
  assert.match(svg, /0.075 → 0.147/);
  assert.match(svg, /418 ms/);
});
