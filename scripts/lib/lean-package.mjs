import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
export const DIST_DIR = path.join(REPO_ROOT, "dist");
export const STAGE_DIR = path.join(REPO_ROOT, "package");
export const STAGE_DIST_DIR = path.join(STAGE_DIR, "dist");
const PREBUILT_FALLBACK_PATH = path.join(SCRIPT_DIR, "lean-core-fallback.js");
const PREBUILT_FALLBACK_META_PATH = path.join(SCRIPT_DIR, "lean-core-fallback.json");
export const CORE_RUNTIME_GZIP_BUDGET_BYTES = 10 * 1024;
export const CORE_TARBALL_BUDGET_BYTES = 12 * 1024;

const CORE_BUNDLE_ORDER = [
  "core-types.js",
  "reveal-tuning.js",
  "core-utils.js",
  "arrival-estimator.js",
  "reveal-boundaries.js",
  "reveal-controller.js",
  "stream-adapters.js",
  "core.js",
];

const CORE_RUNTIME_EXPORTS = [
  "EMPTY_SNAPSHOT",
  "EMPTY_DEBUG_STATE",
  "DEFAULT_REVEAL_TUNING",
  "FAST_FIRST_REVEAL_TUNING",
  "REVEAL_TUNING_PRESETS",
  "SOFT_FINISH_REVEAL_TUNING",
  "mergeRevealTuning",
  "resolveRevealTuningPreset",
  "adapters",
  "createSoftLlmChatStream",
  "createSoftLlmStream",
];

const LEAN_TUNING_EXPORTS = [
  "DEFAULT_REVEAL_TUNING",
  "FAST_FIRST_REVEAL_TUNING",
  "REVEAL_TUNING_PRESETS",
  "SOFT_FINISH_REVEAL_TUNING",
  "mergeRevealTuning",
  "resolveRevealTuningPreset",
];

const LEAN_ADAPTER_EXPORTS = ["adapters"];

const LEAN_CORE_EXPORTS = ["createSoftLlmChatStream", "createSoftLlmStream"];

let terserApi = null;
let minifiedCoreRuntimePromise = null;

function loadTerser() {
  if (terserApi) {
    return terserApi;
  }

  const candidates = [
    "terser",
    "/usr/share/nodejs/terser/dist/bundle.min.cjs",
  ];

  for (const candidate of candidates) {
    try {
      terserApi = require(candidate);
      break;
    } catch {
      // continue
    }
  }

  if (!terserApi) {
    throw new Error(
      "Terser is required for lean packaging. Install the terser npm package or provide the system module/CLI.",
    );
  }

  return terserApi;
}

export function getBundleSourceHash(code) {
  return createHash("sha256").update(code).digest("hex");
}

function getPrebuiltFallbackMeta() {
  if (!fs.existsSync(PREBUILT_FALLBACK_META_PATH)) {
    return null;
  }

  return JSON.parse(readText(PREBUILT_FALLBACK_META_PATH));
}

function getPrebuiltFallbackCode(expectedSourceBundleSha256) {
  const metadata = getPrebuiltFallbackMeta();

  if (!metadata || !fs.existsSync(PREBUILT_FALLBACK_PATH)) {
    return null;
  }

  if (metadata.sourceBundleSha256 !== expectedSourceBundleSha256) {
    return null;
  }

  return {
    code: readText(PREBUILT_FALLBACK_PATH),
    metadata,
  };
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function resolveExecutable(command) {
  if (process.platform === "win32" && command === "node") {
    return process.execPath;
  }

  return command;
}

function stripLocalRuntimeModule(text) {
  return `${text
    .replace(/^import[\s\S]*?;\n?/gm, "")
    .replace(/^export\s+\*[\s\S]*?;\n?/gm, "")
    .replace(/^export\s+\{[\s\S]*?;\n?/gm, "")
    .replace(/\bexport\s+(?=(async\s+function|const|function|class|let|var)\b)/g, "")
    .replace(/^\/\/\# sourceMappingURL=.*$/gm, "")
    .trim()}\n`;
}

function bundleCoreRuntimeSource() {
  const body = CORE_BUNDLE_ORDER
    .map((fileName) => stripLocalRuntimeModule(readText(path.join(DIST_DIR, fileName))))
    .join("\n");

  return `${body}\nexport { ${CORE_RUNTIME_EXPORTS.join(", ")} };\n`;
}

function extractExportedStatements(filePath, exportNames) {
  const source = readText(filePath);

  return exportNames.map((exportName) => {
    const declarationStart = source.search(
      new RegExp(`^export declare (?:const|function) ${exportName}\\b`, "m"),
    );

    if (declarationStart < 0) {
      throw new Error(`Unable to find declaration for ${exportName} in ${filePath}.`);
    }

    let braceDepth = 0;
    let parenDepth = 0;

    for (let index = declarationStart; index < source.length; index += 1) {
      const char = source[index];

      if (char === "{") {
        braceDepth += 1;
      } else if (char === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
      } else if (char === "(") {
        parenDepth += 1;
      } else if (char === ")") {
        parenDepth = Math.max(0, parenDepth - 1);
      } else if (char === ";" && braceDepth === 0 && parenDepth === 0) {
        return source.slice(declarationStart, index + 1).trim();
      }
    }

    throw new Error(`Unable to terminate declaration for ${exportName} in ${filePath}.`);
  });
}

function createLeanTypeDeclarations() {
  const sections = [
    readText(path.join(DIST_DIR, "core-types.d.ts")).trim(),
    ...extractExportedStatements(path.join(DIST_DIR, "reveal-tuning.d.ts"), LEAN_TUNING_EXPORTS),
    ...extractExportedStatements(path.join(DIST_DIR, "stream-adapters.d.ts"), LEAN_ADAPTER_EXPORTS),
    ...extractExportedStatements(path.join(DIST_DIR, "core.d.ts"), LEAN_CORE_EXPORTS),
  ];

  return `${sections.join("\n\n")}\n`;
}

async function minifyModule(code) {
  const terser = loadTerser();
  const result = await terser.minify(code, {
    module: true,
    ecma: 2020,
    compress: {
      passes: 5,
      pure_getters: true,
      reduce_vars: true,
      collapse_vars: true,
      booleans_as_integers: true,
      toplevel: true,
    },
    mangle: {
      toplevel: true,
    },
    format: {
      comments: false,
      ecma: 2020,
    },
  });

  if (result.error || !result.code) {
    throw result.error ?? new Error("Terser returned no output.");
  }

  return `${result.code.trim()}\n`;
}

async function getMinifiedCoreRuntime(bundleSource) {
  if (!minifiedCoreRuntimePromise) {
    minifiedCoreRuntimePromise = minifyModule(bundleSource);
  }

  return minifiedCoreRuntimePromise;
}

export async function resolveLeanRuntimeArtifact() {
  const bundleSource = bundleCoreRuntimeSource();
  const sourceBundleSha256 = getBundleSourceHash(bundleSource);

  try {
    return {
      code: await getMinifiedCoreRuntime(bundleSource),
      sourceBundleSha256,
      mode: "terser",
    };
  } catch (error) {
    const fallback = getPrebuiltFallbackCode(sourceBundleSha256);

    if (!fallback) {
      throw error;
    }

    return {
      code: fallback.code,
      sourceBundleSha256,
      mode: "prebuilt-fallback",
      fallbackBundleSha256: fallback.metadata.fallbackBundleSha256,
    };
  }
}

function createLeanPackageJson() {
  const sourcePackageJson = JSON.parse(readText(path.join(REPO_ROOT, "package.json")));

  return {
    name: sourcePackageJson.name,
    version: sourcePackageJson.version,
    description: sourcePackageJson.description,
    license: sourcePackageJson.license,
    type: sourcePackageJson.type,
    main: "./dist/core.js",
    types: "./dist/core.d.ts",
    repository: sourcePackageJson.repository,
    homepage: sourcePackageJson.homepage,
    bugs: sourcePackageJson.bugs,
    keywords: sourcePackageJson.keywords,
    engines: sourcePackageJson.engines,
    publishConfig: sourcePackageJson.publishConfig,
    exports: {
      ".": {
        types: "./dist/core.d.ts",
        import: "./dist/core.js",
      },
    },
    sideEffects: false,
  };
}

function createLeanReadme() {
  return "# @ramenm/soft-llm-stream\n\nCore runtime.\n";
}

export async function buildLeanPackage() {
  const runtime = await resolveLeanRuntimeArtifact();
  const types = createLeanTypeDeclarations();

  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  fs.mkdirSync(STAGE_DIST_DIR, { recursive: true });

  writeText(path.join(STAGE_DIST_DIR, "core.js"), runtime.code);
  writeText(path.join(STAGE_DIST_DIR, "core.d.ts"), types);
  writeText(path.join(STAGE_DIR, "package.json"), JSON.stringify(createLeanPackageJson()));
  writeText(path.join(STAGE_DIR, "README.md"), createLeanReadme());

  return getLeanPackageMetrics(runtime);
}

export function getLeanPackageMetrics(runtime = null) {
  const coreJsPath = path.join(STAGE_DIST_DIR, "core.js");
  const coreTypesPath = path.join(STAGE_DIST_DIR, "core.d.ts");
  const coreBytes = fs.existsSync(coreJsPath) ? fs.statSync(coreJsPath).size : 0;
  const coreGzipBytes = fs.existsSync(coreJsPath)
    ? gzipSync(fs.readFileSync(coreJsPath), { level: 9 }).length
    : 0;
  const coreTypesBytes = fs.existsSync(coreTypesPath) ? fs.statSync(coreTypesPath).size : 0;

  return {
    stageDir: STAGE_DIR,
    coreBytes,
    coreGzipBytes,
    coreTypesBytes,
    budgetBytes: CORE_RUNTIME_GZIP_BUDGET_BYTES,
    withinBudget: coreGzipBytes <= CORE_RUNTIME_GZIP_BUDGET_BYTES,
    minifier: runtime?.mode ?? "unknown",
    sourceBundleSha256: runtime?.sourceBundleSha256 ?? null,
    fallbackBundleSha256: runtime?.fallbackBundleSha256 ?? null,
  };
}

export function isPrebuiltLeanFallbackInSync() {
  const fallback = getPrebuiltFallbackCode(getBundleSourceHash(bundleCoreRuntimeSource()));
  return Boolean(fallback);
}

export function packLeanPackage({ dryRun = true, cwd = REPO_ROOT } = {}) {
  const args = ["pack"];

  if (dryRun) {
    args.push("--dry-run");
  }

  args.push("--json", "--ignore-scripts", STAGE_DIR);

  const result = spawnSync("npm", args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `npm pack failed for ${STAGE_DIR}.`);
  }

  const rows = JSON.parse(result.stdout);
  return rows[0];
}

export function assertLeanBudgets(packInfo, metrics = getLeanPackageMetrics()) {
  const failures = [];

  if (metrics.coreGzipBytes > CORE_RUNTIME_GZIP_BUDGET_BYTES) {
    failures.push(
      `core runtime gzip budget exceeded: ${metrics.coreGzipBytes} > ${CORE_RUNTIME_GZIP_BUDGET_BYTES}`,
    );
  }

  if (packInfo.size > CORE_TARBALL_BUDGET_BYTES) {
    failures.push(`core tarball budget exceeded: ${packInfo.size} > ${CORE_TARBALL_BUDGET_BYTES}`);
  }

  if (failures.length > 0) {
    throw new Error(failures.join("; "));
  }
}

function resolveTypeScriptCommand() {
  const localTsc = path.join(
    REPO_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsc.cmd" : "tsc",
  );

  return fs.existsSync(localTsc) ? localTsc : "tsc";
}

async function smokeImportCoreFrom(stageDistDir) {
  const modulePath = path.join(stageDistDir, "core.js");
  const core = await import(pathToFileURL(modulePath).href);

  const source = {
    async *[Symbol.asyncIterator]() {
      yield "Hello";
      yield " world";
    },
  };

  const store = core.createSoftLlmStream({
    source,
    adapter: "text",
    reveal: false,
  });

  const snapshot = await store.start();
  return {
    snapshot,
    coreExports: Object.keys(core).sort(),
  };
}

function runCommand(command, args, { cwd, env } = {}) {
  const result = spawnSync(resolveExecutable(command), args, {
    cwd,
    env: {
      ...process.env,
      ...(env ?? {}),
    },
    encoding: "utf8",
    shell: process.platform === "win32" && command !== "node",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `${command} ${args.join(" ")} failed.`);
  }

  return result;
}

export async function smokeInstallLeanTarball() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "soft-llm-stream-pack-"));

  try {
    const consumerDir = path.join(tempRoot, "consumer");
    fs.mkdirSync(consumerDir, { recursive: true });
    writeText(
      path.join(consumerDir, "package.json"),
      JSON.stringify({
        name: "soft-llm-stream-smoke-consumer",
        private: true,
        type: "module",
      }),
    );

    const packInfo = packLeanPackage({ dryRun: false, cwd: tempRoot });
    const tarballPath = path.join(tempRoot, packInfo.filename);

    runCommand(
      "npm",
      ["install", "--silent", "--ignore-scripts", "--no-package-lock", tarballPath],
      { cwd: consumerDir },
    );

    const execution = runCommand(
      "node",
      [
        "--input-type=module",
        "-e",
        [
          "import * as core from '@ramenm/soft-llm-stream';",
          "const source={async *[Symbol.asyncIterator](){yield 'Hello';yield ' world';}};",
          "const store=core.createSoftLlmStream({source,adapter:'text',reveal:false});",
          "const snapshot=await store.start();",
          "console.log(JSON.stringify({snapshot,coreExports:Object.keys(core).sort()}));",
        ].join(""),
      ],
      { cwd: consumerDir },
    );

    const parsed = JSON.parse(execution.stdout.trim());

    writeText(
      path.join(consumerDir, "index.ts"),
      [
        "import { createSoftLlmStream, type CreateSoftLlmStreamOptions, type StreamSnapshot } from '@ramenm/soft-llm-stream';",
        "const source={async *[Symbol.asyncIterator](){yield 'Hello';yield ' world';}};",
        "const options: CreateSoftLlmStreamOptions={source,adapter:'text',reveal:false};",
        "const store=createSoftLlmStream(options);",
        "const snapshot: Promise<StreamSnapshot>=store.start();",
        "void snapshot;",
      ].join("\n"),
    );
    writeText(
      path.join(consumerDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            module: "NodeNext",
            moduleResolution: "NodeNext",
            target: "ES2022",
            strict: true,
            noEmit: true,
          },
          include: ["index.ts"],
        },
        null,
        2,
      ),
    );

    runCommand(resolveTypeScriptCommand(), ["-p", "tsconfig.json"], { cwd: consumerDir });

    return {
      ...parsed,
      typecheckOk: true,
      packInfo: {
        filename: packInfo.filename,
        size: packInfo.size,
      },
    };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

export async function smokeImportLeanCore() {
  return smokeImportCoreFrom(STAGE_DIST_DIR);
}
