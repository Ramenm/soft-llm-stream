import { createPresetTrace, summarizeTrace } from "./lib/random-trace.mjs";
import { runRealtimeTraceBenchmark } from "./lib/smoothness-harness.mjs";

const trace = createPresetTrace({
  preset: "llm-code",
  seed: 42,
  text:
    "```ts\nexport async function streamAnswer(prompt: string) {\n  const stream = client.responses.stream({ model: \"gpt-4.1\", input: prompt });\n\n  let answer = \"\";\n  for await (const event of stream) {\n    if (event.type === \"response.output_text.delta\") answer += event.delta;\n  }\n\n  return answer.trim();\n}\n```\n\nThe stand should feel like code is arriving in medium batches instead of single-token drips.",
});

const result = await runRealtimeTraceBenchmark({ trace });
console.log(JSON.stringify({
  traceName: result.traceName,
  traceStats: summarizeTrace(trace),
  metrics: result.metrics,
  finalText: result.finalSnapshot.text,
}, null, 2));
