import { createSoftLlmChatStream, createSoftLlmStream } from "./core.js";
function bindStore(target, store, render) {
    let lastRawText = "";
    let textNode = null;
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
                        }
                        else {
                            textNode.data += delta;
                        }
                    }
                    lastRawText = output;
                    return;
                }
                if (typeof document !== "undefined" &&
                    typeof document.createTextNode === "function") {
                    textNode = document.createTextNode(output);
                    target.replaceChildren(textNode);
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
export function bindSoftLlmStream(target, options) {
    const store = createSoftLlmStream(options);
    return bindStore(target, store, options.render);
}
export function bindSoftLlmChatStream(target, options) {
    const store = createSoftLlmChatStream(options);
    return bindStore(target, store, options.render);
}
