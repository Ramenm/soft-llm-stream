export * from "./core-types.js";
export { adapters } from "./stream-adapters.js";
export { DEFAULT_REVEAL_TUNING, FAST_FIRST_REVEAL_TUNING, REVEAL_TUNING_PRESETS, SOFT_FINISH_REVEAL_TUNING, mergeRevealTuning, resolveRevealTuningPreset, } from "./reveal-tuning.js";
import type { CreateSoftLlmChatStreamOptions, CreateSoftLlmStreamOptions, SoftLlmStreamStore } from "./core-types.js";
export declare function createSoftLlmChatStream(options: CreateSoftLlmChatStreamOptions): SoftLlmStreamStore;
export declare function createSoftLlmStream(options: CreateSoftLlmStreamOptions): SoftLlmStreamStore;
