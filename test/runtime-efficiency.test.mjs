import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_REVEAL_TUNING,
  advanceReveal,
  createRevealController,
  createCodeFenceState,
  noteControllerChunk,
} from '../dist/internal.js';
import { createSoftLlmStream } from '../dist/index.js';
import { bindSoftLlmStream } from '../dist/dom.js';

function delayedIterable(chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        if (chunk.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, chunk.delayMs));
        }
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
      reject(new Error('Timed out waiting for stream snapshot'));
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

function installFakeBrowserEnvironment(options = {}) {
  const frameDelayMs = options.frameDelayMs ?? 50;
  const previous = {
    document: globalThis.document,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
    window: globalThis.window,
  };

  globalThis.document = {
    visibilityState: 'visible',
    documentElement: { lang: 'en' },
    addEventListener() {},
    removeEventListener() {},
    createTextNode(text) {
      return {
        nodeType: 3,
        data: text,
        owner: null,
        appendData(delta) {
          this.data += delta;
          if (this.owner) {
            this.owner.textContent = this.data;
          }
        },
      };
    },
  };

  globalThis.window = {
    matchMedia() {
      return { matches: false };
    },
  };

  globalThis.requestAnimationFrame = (callback) =>
    setTimeout(() => callback(Date.now()), frameDelayMs);
  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);

  return () => {
    if (previous.document === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previous.document;
    }

    if (previous.window === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previous.window;
    }

    if (previous.requestAnimationFrame === undefined) {
      delete globalThis.requestAnimationFrame;
    } else {
      globalThis.requestAnimationFrame = previous.requestAnimationFrame;
    }

    if (previous.cancelAnimationFrame === undefined) {
      delete globalThis.cancelAnimationFrame;
    } else {
      globalThis.cancelAnimationFrame = previous.cancelAnimationFrame;
    }
  };
}


test('reveal controller reuses one debug-state object across frames', () => {
  const controller = createRevealController({
    locale: 'en',
    tuning: DEFAULT_REVEAL_TUNING,
  });
  const initialDebugState = controller.debugState;

  noteControllerChunk(controller, 'Hello world', 0);
  const stepOne = advanceReveal(controller, {
    fullText: 'Hello world from soft llm stream',
    renderedLength: 0,
    at: 0,
    codeFenceState: createCodeFenceState(),
  });
  const stepTwo = advanceReveal(controller, {
    fullText: 'Hello world from soft llm stream',
    renderedLength: stepOne.nextSliceEnd,
    at: 16,
    codeFenceState: createCodeFenceState(),
  });

  assert.equal(stepOne.debugState, initialDebugState);
  assert.equal(stepTwo.debugState, initialDebugState);
});

test('advanceReveal suggests a longer sleep when reveal budget is exhausted', () => {
  const tuning = {
    ...DEFAULT_REVEAL_TUNING,
    bootstrapMinRateCharsPerMs: 1 / 420,
    bootstrapMaxRateCharsPerMs: 1 / 240,
    estimatedRateMaxCharsPerMs: 1 / 200,
  };
  const controller = createRevealController({ locale: 'en', tuning });

  noteControllerChunk(controller, 'Hello there', 0);
  const result = advanceReveal(controller, {
    fullText: 'Hello there',
    renderedLength: 0,
    at: 0,
    codeFenceState: createCodeFenceState(),
  });

  assert.ok(result.nextSliceEnd > 0);
  assert.ok(
    result.suggestedDelayMs >= 40,
    `expected suggestedDelayMs >= 40, received ${result.suggestedDelayMs}`,
  );
});

test('first paint can land before a slow animation frame fires', async () => {
  const restore = installFakeBrowserEnvironment({ frameDelayMs: 60 });

  try {
    const store = createSoftLlmStream({
      source: delayedIterable([{ delayMs: 0, text: 'Hello there' }]),
    });

    const started = store.start();
    await waitForSnapshot(store, (snapshot) => snapshot.fullText.length > 0, 40);
    const firstVisibleSnapshot = await waitForSnapshot(
      store,
      (snapshot) => snapshot.text.length > 0,
      30,
    );

    assert.ok(firstVisibleSnapshot.text.length > 0);
    await started;
  } finally {
    restore();
  }
});

test('bindSoftLlmStream reuses the same text node when output only grows by prefix', async () => {
  const restore = installFakeBrowserEnvironment({ frameDelayMs: 16 });

  try {
    const target = {
      textContent: '',
      firstChild: null,
      replaceChildrenCount: 0,
      replaceChildren(node) {
        this.replaceChildrenCount += 1;
        this.firstChild = node ?? null;
        if (this.firstChild) {
          this.firstChild.owner = this;
        }
        this.textContent = node?.data ?? '';
      },
      append() {},
    };

    const binding = bindSoftLlmStream(target, {
      source: delayedIterable([
        { delayMs: 0, text: 'Hello' },
        { delayMs: 0, text: ' world' },
      ]),
      reveal: false,
    });

    await binding.start();

    assert.equal(target.textContent, 'Hello world');
    assert.equal(target.replaceChildrenCount, 1);
  } finally {
    restore();
  }
});
