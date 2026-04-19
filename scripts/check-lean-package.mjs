import {
  CORE_RUNTIME_GZIP_BUDGET_BYTES,
  CORE_TARBALL_BUDGET_BYTES,
  assertLeanBudgets,
  buildLeanPackage,
  packLeanPackage,
  smokeImportLeanCore,
  smokeInstallLeanTarball,
} from "./lib/lean-package.mjs";

const metrics = await buildLeanPackage();
const packInfo = packLeanPackage();
const smoke = await smokeImportLeanCore();
const consumerSmoke = await smokeInstallLeanTarball();

assertLeanBudgets(packInfo, metrics);

console.table([
  {
    artifact: "package/dist/core.js.gz",
    bytes: metrics.coreGzipBytes,
    budget: CORE_RUNTIME_GZIP_BUDGET_BYTES,
    ok: metrics.withinBudget,
    minifier: metrics.minifier,
  },
  {
    artifact: packInfo.filename,
    bytes: packInfo.size,
    budget: CORE_TARBALL_BUDGET_BYTES,
    ok: packInfo.size <= CORE_TARBALL_BUDGET_BYTES,
  },
]);

console.log({
  smokeText: smoke.snapshot.text,
  consumerSmokeText: consumerSmoke.snapshot.text,
  consumerTypecheckOk: consumerSmoke.typecheckOk,
  coreExports: smoke.coreExports,
  consumerExports: consumerSmoke.coreExports,
  consumerTarball: consumerSmoke.packInfo,
  minifier: metrics.minifier,
  sourceBundleSha256: metrics.sourceBundleSha256,
});
