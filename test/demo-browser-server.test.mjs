import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const HOST = "127.0.0.1";
const PORT = 43173;
const BASE_URL = `http://${HOST}:${PORT}`;

async function waitForServer(url, timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // server not ready yet
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for demo server at ${url}`);
}

function requestRawPath(rawPath) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: HOST,
        port: PORT,
        method: "GET",
        path: rawPath,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    request.once("error", reject);
    request.end();
  });
}

test("demo server serves browser helper .mjs files as JavaScript modules", async () => {
  const child = spawn(process.execPath, ["./scripts/demo-browser-server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stderr = [];
  child.stderr.on("data", (chunk) => {
    stderr.push(String(chunk));
  });

  try {
    await waitForServer(`${BASE_URL}/`);

    const pageResponse = await fetch(`${BASE_URL}/`);
    const pageHtml = await pageResponse.text();

    assert.equal(pageResponse.status, 200);
    assert.match(pageHtml, /Raw stream vs soft-llm-stream/);

    const response = await fetch(`${BASE_URL}/scripts/lib/random-trace.mjs`);
    const removedPathResponse = await fetch(`${BASE_URL}/examples/browser-compare/`);

    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type") ?? "",
      /^text\/javascript\b/i,
    );
    assert.equal(removedPathResponse.status, 404);
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(3000),
    ]);
  }

  assert.equal(stderr.join(""), "");
});

test("demo server rejects traversal attempts that escape the repo root through same-prefix sibling paths", async () => {
  const repoRoot = process.cwd();
  const siblingRoot = fs.mkdtempSync(
    path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-sibling-`),
  );
  const leakedFilePath = path.join(siblingRoot, "secret.txt");
  fs.writeFileSync(leakedFilePath, "outside root");

  const child = spawn(process.execPath, ["./scripts/demo-browser-server.mjs"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForServer(`${BASE_URL}/`);

    const response = await requestRawPath(
      `/%2e%2e/${encodeURIComponent(path.basename(siblingRoot))}/secret.txt`,
    );

    assert.equal(response.status, 403);
    assert.equal(response.body, "Forbidden");
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(3000),
    ]);
    fs.rmSync(siblingRoot, { recursive: true, force: true });
  }
});
