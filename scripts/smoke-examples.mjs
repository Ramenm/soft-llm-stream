import assert from 'node:assert/strict';

import { runExample as runBasicEventStream } from '../examples/basic-event-stream.mjs';
import { runExample as runResponseJsonl } from '../examples/response-jsonl.mjs';
import { runExample as runPhaseAwareChat } from '../examples/phase-aware-chat.mjs';

const rows = [
  ['basic-event-stream', await runBasicEventStream()],
  ['response-jsonl', await runResponseJsonl()],
  ['phase-aware-chat', await runPhaseAwareChat()],
];

assert.equal(rows[0][1].text, 'Hello from the event adapter.');
assert.equal(rows[0][1].phase, 'thinking');
assert.equal(rows[1][1].text, 'Hello from JSONL.');
assert.equal(rows[2][1].text, 'Let me check that against the latest records. Done.');
assert.equal(rows[2][1].phase, 'writing');
assert.ok(rows.every(([, result]) => result.status === 'done'));

console.table(
  rows.map(([name, result]) => ({
    example: name,
    status: result.status,
    phase: result.phase ?? '—',
    text: result.text,
  })),
);
