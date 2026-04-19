import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createSoftLlmChatStream, createSoftLlmStream } from "./core.js";
function useStoreAutoStop(store, providedStore) {
    useEffect(() => {
        if (providedStore) {
            return;
        }
        return () => {
            void store.stop();
        };
    }, [providedStore, store]);
}
function withStoreActions(snapshot, store) {
    return {
        ...snapshot,
        store,
        start: store.start,
        stop: store.stop,
        reset: store.reset,
    };
}
function useVisibleSnapshot(store) {
    const getVisibleSnapshot = useMemo(() => {
        let cached = null;
        return () => {
            const snapshot = store.getSnapshot();
            if (cached &&
                cached.text === snapshot.text &&
                cached.status === snapshot.status &&
                cached.error === snapshot.error &&
                cached.hasBacklog === snapshot.hasBacklog) {
                return cached;
            }
            cached = {
                text: snapshot.text,
                status: snapshot.status,
                error: snapshot.error,
                hasBacklog: snapshot.hasBacklog,
            };
            return cached;
        };
    }, [store]);
    return useSyncExternalStore(store.subscribe, getVisibleSnapshot, getVisibleSnapshot);
}
function useResolvedStore(options, createStore) {
    const { store: providedStore, ...storeOptions } = options;
    const { source, adapter, locale, autoStart, reveal, hiddenPolicy, onEvent, revealProfile, debug, } = storeOptions;
    const store = useMemo(() => {
        if (providedStore) {
            return providedStore;
        }
        return createStore(storeOptions);
    }, [
        providedStore,
        createStore,
        source,
        adapter,
        locale,
        autoStart,
        reveal,
        hiddenPolicy,
        onEvent,
        revealProfile,
        debug,
    ]);
    return [store, providedStore];
}
export function useSoftLlmStream(options) {
    const [store, providedStore] = useResolvedStore(options, createSoftLlmStream);
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    useStoreAutoStop(store, providedStore);
    return withStoreActions(snapshot, store);
}
export function useSoftLlmChatStream(options) {
    const [store, providedStore] = useResolvedStore(options, createSoftLlmChatStream);
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    useStoreAutoStop(store, providedStore);
    return withStoreActions(snapshot, store);
}
export function useSoftLlmStreamText(options) {
    const [store, providedStore] = useResolvedStore(options, createSoftLlmStream);
    const snapshot = useVisibleSnapshot(store);
    useStoreAutoStop(store, providedStore);
    return withStoreActions(snapshot, store);
}
export function useSoftLlmChatStreamText(options) {
    const [store, providedStore] = useResolvedStore(options, createSoftLlmChatStream);
    const snapshot = useVisibleSnapshot(store);
    useStoreAutoStop(store, providedStore);
    return withStoreActions(snapshot, store);
}
