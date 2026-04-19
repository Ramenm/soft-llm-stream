import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const rootDir = process.cwd();
const distDir = path.join(rootDir, "dist");
const backupDir = path.join(rootDir, ".tmp-dist-backup-test");
const distEntry = path.join(distDir, "index.js");

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function removeIfExists(target) {
  if (await pathExists(target)) {
    await fs.rm(target, { recursive: true, force: true });
  }
}

test("ensure-dist rebuilds dist when it is missing", async () => {
  await removeIfExists(backupDir);

  const hadDist = await pathExists(distDir);
  if (hadDist) {
    await fs.rename(distDir, backupDir);
  }

  let stdout = "";
  let stderr = "";

  try {
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ["./scripts/ensure-dist.mjs"], {
        cwd: rootDir,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
      child.once("error", reject);
      child.once("exit", resolve);
    });

    assert.equal(exitCode, 0, `stdout:\n${stdout}\nstderr:\n${stderr}`);
    assert.equal(await pathExists(distEntry), true, `stdout:\n${stdout}\nstderr:\n${stderr}`);
  } finally {
    await removeIfExists(distDir);
    if (hadDist) {
      await fs.rename(backupDir, distDir);
    } else {
      await removeIfExists(backupDir);
    }
  }
});