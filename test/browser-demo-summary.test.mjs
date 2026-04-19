import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const INDEX_HTML = fs.readFileSync(path.resolve('index.html'), 'utf8');

test('browser demo includes a live comparison summary strip for showcase screenshots', () => {
  assert.match(INDEX_HTML, /Live comparison summary/);
  assert.match(INDEX_HTML, /summary-jump-value/);
  assert.match(INDEX_HTML, /summary-freeze-value/);
  assert.match(INDEX_HTML, /summary-updates-value/);
  assert.match(INDEX_HTML, /summary-done-value/);
});
