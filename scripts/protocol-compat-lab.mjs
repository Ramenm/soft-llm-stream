import { runProtocolScenarioMatrix } from './lib/protocol-lab.mjs';

const result = await runProtocolScenarioMatrix();

console.table(result.rows);

if (result.failures > 0) {
  throw new Error(`protocol lab failed in ${result.failures} scenario(s)`);
}
