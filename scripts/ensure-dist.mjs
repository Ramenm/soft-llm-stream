import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distEntry = path.join(rootDir, "dist", "index.js");

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

if (await exists(distEntry)) {
  console.log("dist/ is ready");
  process.exit(0);
}

console.log("dist/ missing — rebuilding with project-native build script");

try {
  await run(process.platform === "win32" ? "npm.cmd" : "npm", [
    "run",
    "build",
    "--silent",
  ]);
} catch (error) {
  console.warn("npm build failed; trying direct TypeScript build as a fallback");
  await run(process.platform === "win32" ? "tsc.cmd" : "tsc", [
    "-p",
    "tsconfig.build.json",
  ]);
}

if (!(await exists(distEntry))) {
  throw new Error("dist rebuild completed without producing dist/index.js");
}
