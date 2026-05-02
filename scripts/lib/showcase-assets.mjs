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
  const idle = findProfileRow(
    summary?.idleProfiles,
    summary?.recommendations?.idleSoftnessProfile ?? demoProfile,
  );
  const gatesPassed = Array.isArray(summary?.gates)
    ? summary.gates.filter((row) => row?.ok).length
    : 0;
  const gateCount = Array.isArray(summary?.gates) ? summary.gates.length : 0;

  return [
    {
      label: 'Gates',
      value: `${gatesPassed}/${gateCount}`,
      note: summary?.gates?.every?.((row) => row?.ok) ? 'all green' : 'needs attention',
    },
    {
      label: 'Core gzip',
      value: Number.isFinite(summary?.size?.coreGzipBytes)
        ? `${round(summary.size.coreGzipBytes / 1024, 1)} KB`
        : '—',
      note: `${summary?.size?.coreGzipBytes ?? '—'} bytes`,
    },
    {
      label: 'Tail p95',
      value: benchmark ? `${round(benchmark.completionLagP95, 0)} ms` : '—',
      note: `${demoProfile} p95`,
    },
  ];
}

function renderSparkline() {
  return `
    <g transform="translate(626 246)" opacity="0.98">
      <text x="0" y="0" fill="#7bdff6" font-size="11" font-family="Inter, Arial, sans-serif" letter-spacing="1.8">RAW ARRIVALS</text>
      <text x="272" y="0" fill="#87f0c1" font-size="11" font-family="Inter, Arial, sans-serif" letter-spacing="1.8">SOFT REVEAL</text>
      <path d="M0 88 H48 V44 H92 V72 H134 V28 H176 V56 H228 V18" fill="none" stroke="#7bdff6" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" opacity="0.82"/>
      <path d="M272 88 C314 82 338 70 372 61 C414 50 452 42 496 28" fill="none" stroke="#87f0c1" stroke-width="4" stroke-linecap="round" opacity="0.94"/>
      <circle cx="48" cy="44" r="5" fill="#7bdff6"/>
      <circle cx="134" cy="28" r="5" fill="#7bdff6"/>
      <circle cx="496" cy="28" r="5" fill="#87f0c1"/>
      <text x="0" y="126" fill="#9fb0cf" font-size="14" font-family="Inter, Arial, sans-serif">same provider chunks, calmer visible motion</text>
    </g>`;
}

export function renderQualityCardSvg(summary) {
  const demoProfile = summary?.recommendations?.demoProfile ?? 'fastFirst';
  const idleProfile = summary?.recommendations?.idleSoftnessProfile ?? demoProfile;
  const idle = findProfileRow(summary?.idleProfiles, idleProfile);
  const idleLabel = idle
    ? `${round(idle.shareAfter250MsP95, 3)} → ${round(idle.shareAfter750MsP95, 3)}`
    : idleProfile;
  const tiles = buildMetricTiles(summary);
  const generatedAt = summary?.generatedAt
    ? new Date(summary.generatedAt).toISOString().slice(0, 10)
    : 'unknown';

  const positions = [
    { x: 40, y: 246, valueSize: 31 },
    { x: 210, y: 246, valueSize: 31 },
    { x: 404, y: 246, valueSize: 29 },
  ];

  const tileMarkup = tiles
    .map((tile, index) => {
      const position = positions[index] ?? positions[positions.length - 1];
      return `
      <g transform="translate(${position.x} ${position.y})">
        <text x="0" y="0" fill="#7bdff6" font-size="11" font-family="Inter, Arial, sans-serif" letter-spacing="1.55">${escapeXml(tile.label.toUpperCase())}</text>
        <text x="0" y="38" fill="#f5f8ff" font-size="${position.valueSize}" font-weight="800" font-family="Inter, Arial, sans-serif">${escapeXml(tile.value)}</text>
        <text x="0" y="62" fill="#9fb0cf" font-size="12" font-family="Inter, Arial, sans-serif">${escapeXml(tile.note)}</text>
      </g>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="420" viewBox="0 0 1200 420" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">soft-llm-stream validation snapshot</title>
  <desc id="desc">A polished validation snapshot for soft-llm-stream showing green gates, package size, idle softness, and tail lag.</desc>
  <defs>
    <linearGradient id="bg" x1="54" y1="18" x2="1158" y2="404" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0a1020"/>
      <stop offset="0.48" stop-color="#0c1320"/>
      <stop offset="1" stop-color="#092018"/>
    </linearGradient>
    <radialGradient id="aqua" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(230 64) rotate(25) scale(520 260)">
      <stop stop-color="#7bdff6" stop-opacity="0.36"/>
      <stop offset="1" stop-color="#7bdff6" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="mint" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(1016 356) rotate(-148) scale(520 260)">
      <stop stop-color="#87f0c1" stop-opacity="0.24"/>
      <stop offset="1" stop-color="#87f0c1" stop-opacity="0"/>
    </radialGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#000000" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="1200" height="420" rx="38" fill="#05070b"/>
  <rect x="14" y="14" width="1172" height="392" rx="30" fill="url(#bg)" stroke="rgba(255,255,255,0.1)"/>
  <rect x="14" y="14" width="1172" height="392" rx="30" fill="url(#aqua)"/>
  <rect x="14" y="14" width="1172" height="392" rx="30" fill="url(#mint)"/>

  <g filter="url(#softShadow)">
    <text x="40" y="56" fill="#7bdff6" font-size="12" font-family="Inter, Arial, sans-serif" letter-spacing="2.2">SHOWCASE SNAPSHOT</text>
    <text x="40" y="112" fill="#f5f8ff" font-size="56" font-weight="850" font-family="Inter, Arial, sans-serif">soft-llm-stream</text>
    <text x="42" y="150" fill="#c4d4f6" font-size="22" font-family="Inter, Arial, sans-serif">Headless smoothing for bursty LLM streams</text>
    <text x="42" y="186" fill="#8ea3c8" font-size="16" font-family="Inter, Arial, sans-serif">Normalize provider events → reveal text steadily → keep metadata honest.</text>
  </g>

  <g transform="translate(850 42)">
    <rect width="306" height="92" rx="24" fill="rgba(6,10,17,0.58)" stroke="rgba(135,240,193,0.28)"/>
    <text x="24" y="34" fill="#87f0c1" font-size="12" font-family="Inter, Arial, sans-serif" letter-spacing="1.6">RECOMMENDED PROFILE</text>
    <text x="24" y="64" fill="#f5f8ff" font-size="31" font-weight="800" font-family="Inter, Arial, sans-serif">${escapeXml(demoProfile)}</text>
    <text x="24" y="84" fill="#aebfe1" font-size="13" font-family="Inter, Arial, sans-serif">idle p95: ${escapeXml(idleLabel)}</text>
  </g>

  <path d="M42 222 H548" stroke="rgba(255,255,255,0.13)" stroke-width="1"/>
  ${tileMarkup}
  ${renderSparkline()}
  <text x="40" y="390" fill="#8ea3c8" font-size="14" font-family="Inter, Arial, sans-serif">Generated from reports/full-lab-summary.json · updated ${escapeXml(generatedAt)}</text>
</svg>`;
}

export function writeQualityCardFromSummary(summary, outputPath) {
  const absolutePath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const svg = renderQualityCardSvg(summary).replace(/[ \t]+$/gm, '');
  fs.writeFileSync(absolutePath, svg);
  return absolutePath;
}
