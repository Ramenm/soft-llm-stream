import fs from 'node:fs';
import path from 'node:path';

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function round(value, digits = 1) {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return Number(value.toFixed(digits)).toString();
}

function findProfileRow(rows, profile) {
  return Array.isArray(rows)
    ? rows.find((row) => row?.profile === profile) ?? rows[0] ?? null
    : null;
}

function buildMetricTiles(summary) {
  const demoProfile = summary?.recommendations?.demoProfile ?? 'fastFirst';
  const benchmark = findProfileRow(summary?.benchmarkProfiles, demoProfile);
  const idle = findProfileRow(summary?.idleProfiles, summary?.recommendations?.idleSoftnessProfile ?? demoProfile);
  const gatesPassed = Array.isArray(summary?.gates)
    ? summary.gates.filter((row) => row?.ok).length
    : 0;
  const gateCount = Array.isArray(summary?.gates) ? summary.gates.length : 0;

  return [
    {
      label: 'lab gates',
      value: `${gatesPassed}/${gateCount}`,
      note: summary?.gates?.every?.((row) => row?.ok) ? 'all green' : 'needs attention',
    },
    {
      label: 'core gzip',
      value: Number.isFinite(summary?.size?.coreGzipBytes)
        ? `${summary.size.coreGzipBytes} B`
        : '—',
      note: 'publish artifact',
    },
    {
      label: 'idle softness',
      value: idle ? `${round(idle.shareAfter250MsP95, 3)} / ${round(idle.shareAfter750MsP95, 3)}` : '—',
      note: '250ms / 750ms',
    },
    {
      label: 'tail lag',
      value: benchmark ? `${round(benchmark.completionLagP95, 1)} ms` : '—',
      note: `${demoProfile} p95`,
    },
  ];
}

export function renderQualityCardSvg(summary) {
  const demoProfile = summary?.recommendations?.demoProfile ?? 'fastFirst';
  const idleProfile = summary?.recommendations?.idleSoftnessProfile ?? demoProfile;
  const tiles = buildMetricTiles(summary);
  const generatedAt = summary?.generatedAt
    ? new Date(summary.generatedAt).toISOString().slice(0, 10)
    : 'unknown';
  const title = 'soft-llm-stream';
  const subtitle = 'Headless smoothing for bursty LLM streams';

  const tileWidth = 258;
  const gap = 18;
  const left = 40;
  const top = 156;

  const tileMarkup = tiles
    .map((tile, index) => {
      const x = left + index * (tileWidth + gap);
      return `
      <g transform="translate(${x} ${top})">
        <rect width="${tileWidth}" height="122" rx="20" fill="rgba(16,23,34,0.82)" stroke="rgba(255,255,255,0.08)"/>
        <text x="22" y="34" fill="#7bdff6" font-size="11" font-family="Inter, Arial, sans-serif" letter-spacing="1.6" text-transform="uppercase">${escapeXml(tile.label.toUpperCase())}</text>
        <text x="22" y="74" fill="#edf2ff" font-size="32" font-weight="700" font-family="Inter, Arial, sans-serif">${escapeXml(tile.value)}</text>
        <text x="22" y="102" fill="#9fb0cf" font-size="15" font-family="Inter, Arial, sans-serif">${escapeXml(tile.note)}</text>
      </g>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="420" viewBox="0 0 1200 420" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)} quality card</title>
  <desc id="desc">Latest validation summary with package size, idle-gap softness, and benchmark tail lag.</desc>
  <defs>
    <linearGradient id="bg" x1="120" y1="32" x2="1042" y2="392" gradientUnits="userSpaceOnUse">
      <stop stop-color="#101722"/>
      <stop offset="1" stop-color="#0d131c"/>
    </linearGradient>
    <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(208 44) rotate(21.8) scale(475 234)">
      <stop stop-color="#7bdff6" stop-opacity="0.26"/>
      <stop offset="1" stop-color="#7bdff6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="420" rx="36" fill="#0a0d12"/>
  <rect x="12" y="12" width="1176" height="396" rx="30" fill="url(#bg)" stroke="rgba(255,255,255,0.08)"/>
  <rect x="12" y="12" width="1176" height="396" rx="30" fill="url(#glow)"/>
  <text x="40" y="56" fill="#7bdff6" font-size="12" font-family="Inter, Arial, sans-serif" letter-spacing="2.1">SHOWCASE SNAPSHOT</text>
  <text x="40" y="104" fill="#edf2ff" font-size="42" font-weight="800" font-family="Inter, Arial, sans-serif">${escapeXml(title)}</text>
  <text x="40" y="138" fill="#9fb0cf" font-size="20" font-family="Inter, Arial, sans-serif">${escapeXml(subtitle)}</text>
  <g transform="translate(862 42)">
    <rect width="292" height="76" rx="18" fill="rgba(9,12,18,0.68)" stroke="rgba(123,223,246,0.24)"/>
    <text x="22" y="31" fill="#87f0c1" font-size="12" font-family="Inter, Arial, sans-serif" letter-spacing="1.4">RECOMMENDED DEMO PROFILE</text>
    <text x="22" y="59" fill="#edf2ff" font-size="26" font-weight="700" font-family="Inter, Arial, sans-serif">${escapeXml(demoProfile)}</text>
    <text x="170" y="59" fill="#9fb0cf" font-size="15" font-family="Inter, Arial, sans-serif">idle-safe: ${escapeXml(idleProfile)}</text>
  </g>
  ${tileMarkup}
  <text x="40" y="362" fill="#9fb0cf" font-size="14" font-family="Inter, Arial, sans-serif">Generated from reports/full-lab-summary.json · updated ${escapeXml(generatedAt)}</text>
</svg>`;
}

export function writeQualityCardFromSummary(summary, outputPath) {
  const absolutePath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const svg = renderQualityCardSvg(summary);
  fs.writeFileSync(absolutePath, svg);
  return absolutePath;
}
