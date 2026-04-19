import type {
  CreateSoftLlmChatStreamOptions,
  CreateSoftLlmStreamOptions,
  SoftLlmStreamStore,
} from "./core.js";
import { createSoftLlmChatStream, createSoftLlmStream } from "./core.js";

export type BindSoftLlmStreamOptions = CreateSoftLlmStreamOptions & {
  render?: (
    text: string,
    snapshot: ReturnType<SoftLlmStreamStore["getSnapshot"]>,
  ) => string | Node | null;
  autoStart?: boolean;
};

export type BindSoftLlmChatStreamOptions = CreateSoftLlmChatStreamOptions & {
  render?: (
    text: string,
    snapshot: ReturnType<SoftLlmStreamStore["getSnapshot"]>,
  ) => string | Node | null;
  autoStart?: boolean;
};

export type SoftLlmStreamBinding = {
  store: SoftLlmStreamStore;
  start: () => Promise<ReturnType<SoftLlmStreamStore["getSnapshot"]>>;
  stop: () => Promise<void>;
  reset: () => void;
  destroy: () => void;
};

function bindStore(
  target: HTMLElement,
  store: SoftLlmStreamStore,
  render?: (
    text: string,
    snapshot: ReturnType<SoftLlmStreamStore["getSnapshot"]>,
  ) => string | Node | null,
): SoftLlmStreamBinding {
  let lastRawText = "";
  let textNode: { data: string; appendData?: (nextText: string) => void } | null =
    null;

  const renderSnapshot = () => {
    const snapshot = store.getSnapshot();

    if (!render && snapshot.text === lastRawText) {
      return;
    }

    const output = render?.(snapshot.text, snapshot) ?? snapshot.text;

    if (typeof output === "string") {
      if (!render) {
        if (textNode && output.startsWith(lastRawText)) {
          const delta = output.slice(lastRawText.length);
          if (delta) {
            if (typeof textNode.appendData === "function") {
              textNode.appendData(delta);
            } else {
              textNode.data += delta;
            }
          }
          lastRawText = output;
          return;
        }

        if (
          typeof document !== "undefined" &&
          typeof document.createTextNode === "function"
        ) {
          textNode = document.createTextNode(output);
          target.replaceChildren(textNode as unknown as Node);
          lastRawText = output;
          return;
        }
      }

      textNode = null;
      lastRawText = output;
      target.textContent = output;
      return;
    }

    textNode = null;
    lastRawText = "";
    target.replaceChildren();
    if (output instanceof Node) {
      target.append(output);
    }
  };

  const unsubscribe = store.subscribe(renderSnapshot);
  renderSnapshot();

  return {
    store,
    start: store.start,
    stop: store.stop,
    reset: store.reset,
    destroy() {
      unsubscribe();
      void store.stop();
    },
  };
}

export function bindSoftLlmStream(
  target: HTMLElement,
  options: BindSoftLlmStreamOptions,
): SoftLlmStreamBinding {
  const store = createSoftLlmStream(options);
  return bindStore(target, store, options.render);
}

export function bindSoftLlmChatStream(
  target: HTMLElement,
  options: BindSoftLlmChatStreamOptions,
): SoftLlmStreamBinding {
  const store = createSoftLlmChatStream(options);
  return bindStore(target, store, options.render);
}

