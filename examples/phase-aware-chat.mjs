import { createSoftLlmChatStream } from '../dist/index.js';

export async function runExample() {
  async function* source() {
    yield { type: 'meta', data: { phase: 'thinking' } };
    yield { type: 'text', text: 'Let me check that' };
    yield { type: 'meta', data: { phase: 'tool' } };
    yield { type: 'replace', text: 'Let me check that against the latest records.' };
    yield { type: 'meta', data: { phase: 'writing' } };
    yield { type: 'text', text: ' Done.' };
    yield { type: 'done' };
  }

  const store = createSoftLlmChatStream({
    source: source(),
    adapter: 'event',
    revealProfile: 'fastFirst',
  });

  const snapshot = await store.start();
  return {
    text: snapshot.text,
    phase: snapshot.meta.phase,
    status: snapshot.status,
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  console.log(await runExample());
}
