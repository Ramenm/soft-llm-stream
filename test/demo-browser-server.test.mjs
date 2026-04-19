import test from "node:test";
import assert from "node:assert/strict";
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
