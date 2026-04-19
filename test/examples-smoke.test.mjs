import assert from 'node:assert/strict';
import test from 'node:test';

import { runExample as runBasicEventStream } from '../examples/basic-event-stream.mjs';
import { runExample as runResponseJsonl } from '../examples/response-jsonl.mjs';
import { runExample as runPhaseAwareChat } from '../examples/phase-aware-chat.mjs';

test('examples stay executable and produce the documented final snapshots', async () => {
  const basic = await runBasicEventStream();
  const jsonl = await runResponseJsonl();
  const phases = await runPhaseAwareChat();

  assert.deepEqual(basic, {
    text: 'Hello from the event adapter.',
    phase: 'thinking',
    status: 'done',
  });
  assert.deepEqual(jsonl, {
    text: 'Hello from JSONL.',
    status: 'done',
  });
  assert.deepEqual(phases, {
    text: 'Let me check that against the latest records. Done.',
    phase: 'writing',
    status: 'done',
  });
});
