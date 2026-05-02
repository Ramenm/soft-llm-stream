import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

function getLocalTypeScriptBinaryPath(repoRoot) {
  return path.join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsc.cmd" : "tsc",
  );
}

function getLocalTypeScriptModulePath(repoRoot) {
  return path.join(repoRoot, "node_modules", "typescript", "lib", "tsc.js");
}

export function resolveTypeScriptInvocation({ repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const localModulePath = getLocalTypeScriptModulePath(repoRoot);
  if (fs.existsSync(localModulePath)) {
    return {
      command: process.execPath,
      args: [localModulePath],
      reason: "local-module",
    };
  }

  try {
    return {
      command: process.execPath,
      args: [require.resolve("typescript/lib/tsc.js")],
      reason: "resolved-module",
    };
  } catch {
    // continue to local binary / PATH fallback
  }

  const localBinaryPath = getLocalTypeScriptBinaryPath(repoRoot);
  if (fs.existsSync(localBinaryPath)) {
    return process.platform === "win32"
      ? {
          command: localBinaryPath,
          args: [],
          reason: "local-bin",
        }
      : {
          command: "sh",
          args: [localBinaryPath],
          reason: "local-bin-shim",
        };
  }

  return {
    command: process.platform === "win32" ? "tsc.cmd" : "tsc",
    args: [],
    reason: "path",
  };
}

export function resolveNpmInvocation() {
  const bundledNpmCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );

  if (fs.existsSync(bundledNpmCli)) {
    return {
      command: process.execPath,
      args: [bundledNpmCli],
      reason: "bundled-npm-cli",
    };
  }

  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: [],
    reason: "path",
  };
}

export function shouldUseShellForCommand(command) {
  if (process.platform !== "win32") {
    return false;
  }

  const normalizedCommand = path.normalize(command).toLowerCase();
  const normalizedNodePath = path.normalize(process.execPath).toLowerCase();
  const extension = path.extname(command).toLowerCase();
  const basename = path.basename(command).toLowerCase();

  if (
    basename === "node" ||
    basename === "node.exe" ||
    normalizedCommand === normalizedNodePath ||
    extension === ".exe"
  ) {
    return false;
  }

  if (extension === ".cmd" || extension === ".bat") {
    return true;
  }

  return !path.isAbsolute(command);
}
