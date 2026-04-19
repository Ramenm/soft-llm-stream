import { createSoftLlmStream } from '../dist/index.js';

export async function runExample() {
  async function* source() {
    yield { type: 'meta', data: { phase: 'thinking' } };
    yield { type: 'text', text: 'Hello' };
    yield { type: 'replace', text: 'Hello from the event adapter.' };
    yield { type: 'done' };
  }

  const store = createSoftLlmStream({
    source: source(),
    adapter: 'event',
    revealProfile: 'balanced',
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
