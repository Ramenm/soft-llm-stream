import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as core from "../dist/index.js";
import * as dom from "../dist/dom.js";

const expectedCoreExports = [
  "adapters",
  "createSoftLlmChatStream",
  "createSoftLlmStream",
  "EMPTY_DEBUG_STATE",
  "EMPTY_SNAPSHOT",
  "DEFAULT_REVEAL_TUNING",
  "FAST_FIRST_REVEAL_TUNING",
  "mergeRevealTuning",
  "REVEAL_TUNING_PRESETS",
  "resolveRevealTuningPreset",
  "SOFT_FINISH_REVEAL_TUNING",
];

const internalHelperExports = [
  "bindSoftLlmChatStream",
  "bindSoftLlmStream",
];

const internalReactSurfaceNames = [
  "useSoftLlmChatStream",
  "useSoftLlmChatStreamText",
  "useSoftLlmStream",
  "useSoftLlmStreamText",
];

const forbiddenNamePatterns = [
  new RegExp(["Stream", "Reveal"].join("")),
  new RegExp(["stream", "-", "reveal"].join("")),
  new RegExp(["Chat", "Soft", "Llm"].join("")),
];

function assertNoForbiddenNames(names) {
  for (const key of names) {
    for (const pattern of forbiddenNamePatterns) {
      assert.equal(pattern.test(key), false, `forbidden export name: ${key}`);
    }
  }
}

function walkTextFiles(rootDir) {
  const output = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const current = queue.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "test") {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }

      if (/\.(md|json|ts|tsx|js|mjs|d\.ts|html)$/u.test(entry.name)) {
        output.push(fullPath);
      }
    }
  }

  return output;
}

test("core public exports and internal helpers use canonical soft-llm-stream naming", () => {
  const coreNames = Object.keys(core);
  const domNames = Object.keys(dom);
  const reactSurface = fs.readFileSync(new URL("../dist/react.d.ts", import.meta.url), "utf8");

  assertNoForbiddenNames(coreNames);
  assertNoForbiddenNames(domNames);
  assertNoForbiddenNames(internalReactSurfaceNames);

  for (const key of expectedCoreExports) {
    assert.ok(key in core, `missing core export: ${key}`);
  }
  for (const key of internalHelperExports) {
    assert.ok(key in dom, `missing internal helper export: ${key}`);
  }
  for (const key of internalReactSurfaceNames) {
    assert.ok(reactSurface.includes(key), `missing internal react helper name: ${key}`);
  }
  for (const pattern of forbiddenNamePatterns) {
    assert.equal(pattern.test(reactSurface), false, `forbidden naming pattern ${pattern} found in react surface`);
  }
});

test("repo text surfaces do not contain legacy or awkward public naming", () => {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  for (const file of walkTextFiles(repoRoot)) {
    const text = fs.readFileSync(file, "utf8");
    for (const pattern of forbiddenNamePatterns) {
      assert.equal(pattern.test(text), false, `forbidden naming pattern ${pattern} found in ${file}`);
    }
  }
});
