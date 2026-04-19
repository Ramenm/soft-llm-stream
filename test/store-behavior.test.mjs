import test from "node:test";
import assert from "node:assert/strict";

import { createSoftLlmStream } from "../dist/index.js";

function delayedIterable(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        await new Promise((resolve) => setTimeout(resolve, chunk.delayMs));
        yield chunk.text;
      }
    },
  };
}

async function waitForSnapshot(store, predicate, timeoutMs = 300) {
  const currentSnapshot = store.getSnapshot();
  if (predicate(currentSnapshot)) {
    return currentSnapshot;
  }

  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for stream snapshot"));
    }, timeoutMs);

    unsubscribe = store.subscribe(() => {
      const snapshot = store.getSnapshot();
      if (!predicate(snapshot)) {
        return;
      }

      clearTimeout(timeout);
      unsubscribe();
      resolve(snapshot);
    });
  });
}

test("stop preserves partial output and moves the store to stopped", async () => {
  const store = createSoftLlmStream({
    source: delayedIterable([
      { delayMs: 0, text: "Hello" },
      { delayMs: 80, text: " there" },
      { delayMs: 120, text: " friend" },
    ]),
  });

  const started = store.start();
  await waitForSnapshot(store, (snapshot) => snapshot.fullText.length > 0);
  await store.stop();

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.status, "stopped");
  assert.ok(snapshot.text.length > 0);
  assert.equal(snapshot.text, snapshot.fullText);

  await started.catch(() => {
    // ignored; store state is asserted directly
  });
});

test("reset returns the store to the idle empty state", async () => {
  const store = createSoftLlmStream({
    source: delayedIterable([{ delayMs: 0, text: "Hello" }]),
    reveal: false,
  });

  await store.start();
  store.reset();

  const snapshot = store.getSnapshot();
  assert.equal(snapshot.status, "idle");
  assert.equal(snapshot.text, "");
  assert.equal(snapshot.fullText, "");
});
