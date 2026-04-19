import { useEffect, useMemo, useSyncExternalStore } from "react";

import type {
  CreateSoftLlmChatStreamOptions,
  CreateSoftLlmStreamOptions,
  SoftLlmStreamStore,
  StreamSnapshot,
} from "./core.js";
import { createSoftLlmChatStream, createSoftLlmStream } from "./core.js";

type StoreActions = {
  store: SoftLlmStreamStore;
  start: () => Promise<StreamSnapshot>;
  stop: () => Promise<void>;
  reset: () => void;
};

type VisibleStreamSnapshot = Pick<
  StreamSnapshot,
  "text" | "status" | "error" | "hasBacklog"
>;

type SharedHookOptions = Pick<
  CreateSoftLlmStreamOptions,
  | "source"
  | "adapter"
  | "locale"
  | "autoStart"
  | "reveal"
  | "hiddenPolicy"
  | "onEvent"
  | "revealProfile"
  | "debug"
>;

export type UseSoftLlmStreamOptions = CreateSoftLlmStreamOptions & {
  store?: SoftLlmStreamStore;
};

export type UseSoftLlmChatStreamOptions = CreateSoftLlmChatStreamOptions & {
  store?: SoftLlmStreamStore;
};

export type UseSoftLlmStreamResult = StreamSnapshot & StoreActions;

export type UseSoftLlmStreamTextResult = VisibleStreamSnapshot & StoreActions;

function useStoreAutoStop(
  store: SoftLlmStreamStore,
  providedStore?: SoftLlmStreamStore,
) {
  useEffect(() => {
    if (providedStore) {
      return;
    }

    return () => {
      void store.stop();
    };
  }, [providedStore, store]);
}

function withStoreActions<T extends object>(
  snapshot: T,
  store: SoftLlmStreamStore,
): T & StoreActions {
  return {
    ...snapshot,
    store,
    start: store.start,
    stop: store.stop,
    reset: store.reset,
  };
}

function useVisibleSnapshot(store: SoftLlmStreamStore) {
  const getVisibleSnapshot = useMemo(() => {
    let cached: VisibleStreamSnapshot | null = null;

    return () => {
      const snapshot = store.getSnapshot();
      if (
        cached &&
        cached.text === snapshot.text &&
        cached.status === snapshot.status &&
        cached.error === snapshot.error &&
        cached.hasBacklog === snapshot.hasBacklog
      ) {
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

  return useSyncExternalStore(
    store.subscribe,
    getVisibleSnapshot,
    getVisibleSnapshot,
  );
}

function useResolvedStore<TOptions extends SharedHookOptions & { store?: SoftLlmStreamStore }>(
  options: TOptions,
  createStore: (options: SharedHookOptions) => SoftLlmStreamStore,
) {
  const { store: providedStore, ...storeOptions } = options;
  const {
    source,
    adapter,
    locale,
    autoStart,
    reveal,
    hiddenPolicy,
    onEvent,
    revealProfile,
    debug,
  } = storeOptions;

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

  return [store, providedStore] as const;
}

export function useSoftLlmStream(
  options: UseSoftLlmStreamOptions,
): UseSoftLlmStreamResult {
  const [store, providedStore] = useResolvedStore(options, createSoftLlmStream);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  useStoreAutoStop(store, providedStore);
  return withStoreActions(snapshot, store);
}

export function useSoftLlmChatStream(
  options: UseSoftLlmChatStreamOptions,
): UseSoftLlmStreamResult {
  const [store, providedStore] = useResolvedStore(options, createSoftLlmChatStream);
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );

  useStoreAutoStop(store, providedStore);
  return withStoreActions(snapshot, store);
}

export function useSoftLlmStreamText(
  options: UseSoftLlmStreamOptions,
): UseSoftLlmStreamTextResult {
  const [store, providedStore] = useResolvedStore(options, createSoftLlmStream);
  const snapshot = useVisibleSnapshot(store);

  useStoreAutoStop(store, providedStore);
  return withStoreActions(snapshot, store);
}

export function useSoftLlmChatStreamText(
  options: UseSoftLlmChatStreamOptions,
): UseSoftLlmStreamTextResult {
  const [store, providedStore] = useResolvedStore(options, createSoftLlmChatStream);
  const snapshot = useVisibleSnapshot(store);

  useStoreAutoStop(store, providedStore);
  return withStoreActions(snapshot, store);
}

