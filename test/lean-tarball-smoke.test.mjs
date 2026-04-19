import test from "node:test";
import assert from "node:assert/strict";

import { buildLeanPackage, smokeInstallLeanTarball } from "../scripts/lib/lean-package.mjs";

test("packed lean tarball installs into a clean consumer and runs", async () => {
  await buildLeanPackage();
  const consumerSmoke = await smokeInstallLeanTarball();

  assert.equal(consumerSmoke.snapshot.text, "Hello world");
  assert.equal(consumerSmoke.typecheckOk, true);
  assert.ok(Array.isArray(consumerSmoke.coreExports));
  assert.ok(consumerSmoke.coreExports.includes("createSoftLlmStream"));
  assert.match(consumerSmoke.packInfo.filename, /ramenm-soft-llm-stream-.*\.tgz$/u);
  assert.ok(consumerSmoke.packInfo.size > 0);
});
