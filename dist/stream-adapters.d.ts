import type { BuiltInStreamAdapterName, StreamAdapter, StreamAdapterName, StreamSource } from "./core-types.js";
type PreparedStreamAdapter = {
    source: StreamSource;
    adapter: StreamAdapter;
};
export declare const adapters: Record<BuiltInStreamAdapterName, StreamAdapter>;
export declare function resolveAdapter(source: StreamSource, adapter?: StreamAdapter | StreamAdapterName): StreamAdapter;
export declare function prepareSourceAdapter(source: StreamSource, adapter: (StreamAdapter | StreamAdapterName) | undefined, signal: AbortSignal): Promise<PreparedStreamAdapter>;
export {};
