import {
  CORE_RUNTIME_GZIP_BUDGET_BYTES,
  CORE_TARBALL_BUDGET_BYTES,
  buildLeanPackage,
  packLeanPackage,
} from "./lib/lean-package.mjs";

const metrics = await buildLeanPackage();
const packInfo = packLeanPackage();

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
