import { createSoftLlmChatStream } from '../dist/index.js';

function createJsonlResponse(lines) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${line}\n`));
        }
        controller.close();
      },
    }),
    {
      headers: {
        'content-type': 'application/x-ndjson; charset=utf-8',
      },
    },
  );
}

export async function runExample() {
  const response = createJsonlResponse([
    JSON.stringify({ type: 'text', text: 'Hello' }),
    JSON.stringify({ type: 'replace', text: 'Hello from JSONL.' }),
    JSON.stringify({ type: 'done' }),
  ]);

  const store = createSoftLlmChatStream({
    source: response,
    adapter: 'auto',
    revealProfile: 'fastFirst',
  });

  const snapshot = await store.start();
  return {
    text: snapshot.text,
    status: snapshot.status,
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1])) {
  console.log(await runExample());
}
