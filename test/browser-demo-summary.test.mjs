import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const INDEX_HTML = fs.readFileSync(path.resolve('index.html'), 'utf8');
const STYLES_CSS = fs.readFileSync(path.resolve('styles.css'), 'utf8');
const RECORD_DEMO_SCRIPT = fs.readFileSync(
  path.resolve('scripts/record-demo.mjs'),
  'utf8',
);

test('browser demo includes a live comparison summary strip for showcase screenshots', () => {
  assert.match(INDEX_HTML, /Live comparison summary/);
  assert.match(INDEX_HTML, /summary-jump-value/);
  assert.match(INDEX_HTML, /summary-freeze-value/);
  assert.match(INDEX_HTML, /summary-updates-value/);
  assert.match(INDEX_HTML, /summary-done-value/);
});

test('recording mode keeps the main compare panes and summary metrics visible', () => {
  assert.match(STYLES_CSS, /body\[data-recording="true"\] \.controls/);
  assert.match(STYLES_CSS, /body\[data-recording="true"\] \.trace-profile/);
  assert.match(STYLES_CSS, /body\[data-recording="true"\] \.experience-strip/);
  assert.match(STYLES_CSS, /position: sticky/);
  assert.match(STYLES_CSS, /body\[data-recording="true"\] \.lane/);
  assert.match(STYLES_CSS, /max-height: calc\(100svh - 270px\)/);
});

test('recording script defaults to the client showcase mode and keeps scroll mode available', () => {
  assert.match(RECORD_DEMO_SCRIPT, /mode: "client"/);
  assert.match(RECORD_DEMO_SCRIPT, /trace: "showcase-chat"/);
  assert.match(RECORD_DEMO_SCRIPT, /trace: "ramp-up-long"/);
  assert.match(RECORD_DEMO_SCRIPT, /document\.body\.dataset\.recording = 'true'/);
  assert.match(RECORD_DEMO_SCRIPT, /document\.querySelector\('#trace-select'\)\.value/);
});
