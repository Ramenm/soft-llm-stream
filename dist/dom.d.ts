import type { CreateSoftLlmChatStreamOptions, CreateSoftLlmStreamOptions, SoftLlmStreamStore } from "./core.js";
export type BindSoftLlmStreamOptions = CreateSoftLlmStreamOptions & {
    render?: (text: string, snapshot: ReturnType<SoftLlmStreamStore["getSnapshot"]>) => string | Node | null;
    autoStart?: boolean;
};
export type BindSoftLlmChatStreamOptions = CreateSoftLlmChatStreamOptions & {
    render?: (text: string, snapshot: ReturnType<SoftLlmStreamStore["getSnapshot"]>) => string | Node | null;
    autoStart?: boolean;
};
export type SoftLlmStreamBinding = {
    store: SoftLlmStreamStore;
    start: () => Promise<ReturnType<SoftLlmStreamStore["getSnapshot"]>>;
    stop: () => Promise<void>;
    reset: () => void;
    destroy: () => void;
};
export declare function bindSoftLlmStream(target: HTMLElement, options: BindSoftLlmStreamOptions): SoftLlmStreamBinding;
export declare function bindSoftLlmChatStream(target: HTMLElement, options: BindSoftLlmChatStreamOptions): SoftLlmStreamBinding;
