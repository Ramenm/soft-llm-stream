import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  resolveNpmInvocation,
  resolveTypeScriptInvocation,
  shouldUseShellForCommand,
} from "../scripts/lib/tooling.mjs";

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "soft-llm-stream-tooling-"));
}

test("resolveTypeScriptInvocation prefers the TypeScript module entry over the local .bin shim when both exist", () => {
  const repoRoot = makeTempRepo();
  const localModulePath = path.join(repoRoot, "node_modules", "typescript", "lib", "tsc.js");
  const localBinPath = path.join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsc.cmd" : "tsc",
  );

  fs.mkdirSync(path.dirname(localModulePath), { recursive: true });
  fs.mkdirSync(path.dirname(localBinPath), { recursive: true });
  fs.writeFileSync(localModulePath, "console.log('tsc');\n");
  fs.writeFileSync(localBinPath, "echo tsc\n");

  const invocation = resolveTypeScriptInvocation({ repoRoot });

  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.args[0], localModulePath);
  assert.equal(invocation.reason, "local-module");
});

test("resolveTypeScriptInvocation uses a non-local fallback when the repo has no local TypeScript", () => {
  const repoRoot = makeTempRepo();

  const invocation = resolveTypeScriptInvocation({ repoRoot });

  assert.notEqual(invocation.reason, "local-module");
  assert.notEqual(invocation.reason, "local-bin");
  assert.notEqual(invocation.reason, "local-bin-shim");

  if (invocation.reason === "resolved-module") {
    assert.equal(invocation.command, process.execPath);
    assert.match(invocation.args[0] ?? "", /typescript[\\/]lib[\\/]tsc\.js$/u);
    return;
  }

  assert.equal(invocation.reason, "path");
});

test("shouldUseShellForCommand does not shell out for the current Node executable", () => {
  assert.equal(shouldUseShellForCommand(process.execPath), false);
});

test("resolveNpmInvocation returns a spawnable command", () => {
  const invocation = resolveNpmInvocation();

  assert.equal(typeof invocation.command, "string");
  assert.ok(invocation.command.length > 0);
  assert.ok(Array.isArray(invocation.args));

  if (invocation.reason === "bundled-npm-cli") {
    assert.equal(invocation.command, process.execPath);
    assert.match(invocation.args[0] ?? "", /npm[\\/]bin[\\/]npm-cli\.js$/u);
  }
});
