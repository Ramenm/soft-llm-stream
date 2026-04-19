import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url)));
const releaseGate = fs.readFileSync(new URL("../scripts/release-gate.mjs", import.meta.url), "utf8");
const buildLeanPackage = fs.readFileSync(new URL("../scripts/build-lean-package.mjs", import.meta.url), "utf8");
const checkLeanPackage = fs.readFileSync(new URL("../scripts/check-lean-package.mjs", import.meta.url), "utf8");

test("root workspace metadata is private and core-only by default", () => {
  assert.equal(packageJson.private, true);
  assert.deepEqual(Object.keys(packageJson.exports).sort(), ["."]);
  assert.equal(packageJson.name, "@ramenm/soft-llm-stream");
});

test("root package keeps accidental publish surface core-only", () => {
  const files = packageJson.files;

  assert.ok(files.includes("README.md"));
  assert.ok(files.includes("LICENSE"));
  assert.ok(files.includes("dist/core.js"));
  assert.ok(!files.includes("dist/dom.js"));
  assert.ok(!files.includes("dist/react.js"));
  assert.ok(files.every((file) => !file.endsWith(".map")));
  assert.ok(files.every((file) => !file.includes("internal")));
  assert.ok(files.every((file) => !file.includes("trace-simulator")));
});

test("release scripts validate a single core-only staged package", () => {
  assert.equal(typeof packageJson.scripts["build:lean"], "string");
  assert.equal(typeof packageJson.scripts["size:check"], "string");
  assert.match(packageJson.scripts["pack:check"], /\.\/package/u);
  assert.doesNotMatch(packageJson.scripts["pack:check"], /package-ultra/u);
  assert.doesNotMatch(releaseGate, /package-ultra/u);
  assert.match(releaseGate, /check-lean-package\.mjs/u);
  assert.doesNotMatch(buildLeanPackage, /buildUltraPackage/u);
  assert.doesNotMatch(checkLeanPackage, /smokeImportUltraCore/u);
  assert.match(checkLeanPackage, /smokeInstallLeanTarball/u);
});

test("staged lean package includes bundled type declarations", async () => {
  const { buildLeanPackage, STAGE_DIR, packLeanPackage } = await import("../scripts/lib/lean-package.mjs");

  await buildLeanPackage();
  const packInfo = packLeanPackage();

  const stagedPackageJson = JSON.parse(
    fs.readFileSync(new URL("../package/package.json", import.meta.url), "utf8"),
  );

  assert.equal(stagedPackageJson.types, "./dist/core.d.ts");
  assert.deepEqual(stagedPackageJson.exports, {
    ".": {
      types: "./dist/core.d.ts",
      import: "./dist/core.js",
    },
  });
  assert.equal(fs.existsSync(new URL("../package/dist/core.d.ts", import.meta.url)), true);
  assert.equal(stagedPackageJson.name, packageJson.name);
  assert.equal(stagedPackageJson.version, packageJson.version);
  assert.equal(STAGE_DIR.endsWith("/package") || STAGE_DIR.endsWith("\\package"), true);
  assert.deepEqual(
    packInfo.files.map((file) => file.path).sort(),
    ["README.md", "dist/core.d.ts", "dist/core.js", "package.json"],
  );
});


test("lean fallback artifact stays in sync with the bundled core source", async () => {
  const { isPrebuiltLeanFallbackInSync } = await import("../scripts/lib/lean-package.mjs");

  assert.equal(isPrebuiltLeanFallbackInSync(), true);
});
