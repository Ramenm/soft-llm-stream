import type { CreateSoftLlmChatStreamOptions, CreateSoftLlmStreamOptions, SoftLlmStreamStore, StreamSnapshot } from "./core.js";
type StoreActions = {
    store: SoftLlmStreamStore;
    start: () => Promise<StreamSnapshot>;
    stop: () => Promise<void>;
    reset: () => void;
};
type VisibleStreamSnapshot = Pick<StreamSnapshot, "text" | "status" | "error" | "hasBacklog">;
export type UseSoftLlmStreamOptions = CreateSoftLlmStreamOptions & {
    store?: SoftLlmStreamStore;
};
export type UseSoftLlmChatStreamOptions = CreateSoftLlmChatStreamOptions & {
    store?: SoftLlmStreamStore;
};
export type UseSoftLlmStreamResult = StreamSnapshot & StoreActions;
export type UseSoftLlmStreamTextResult = VisibleStreamSnapshot & StoreActions;
export declare function useSoftLlmStream(options: UseSoftLlmStreamOptions): UseSoftLlmStreamResult;
export declare function useSoftLlmChatStream(options: UseSoftLlmChatStreamOptions): UseSoftLlmStreamResult;
export declare function useSoftLlmStreamText(options: UseSoftLlmStreamOptions): UseSoftLlmStreamTextResult;
export declare function useSoftLlmChatStreamText(options: UseSoftLlmChatStreamOptions): UseSoftLlmStreamTextResult;
export {};
