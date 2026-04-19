import fs from 'node:fs';
import path from 'node:path';

import { writeQualityCardFromSummary } from './lib/showcase-assets.mjs';

const summaryPath = path.resolve(process.env.FULL_LAB_SUMMARY_PATH || 'reports/full-lab-summary.json');
const outputPath = path.resolve(process.env.QUALITY_CARD_PATH || 'docs/assets/quality-card.svg');

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const writtenPath = writeQualityCardFromSummary(summary, outputPath);
console.log(`quality card written to ${writtenPath}`);
