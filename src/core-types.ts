export type StreamStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "stopping"
  | "stopped"
  | "done"
  | "error";

export type RevealMode =
  | "bootstrap"
  | "steady"
  | "protect"
  | "catchup"
  | "complete";

export type StreamSnapshot = {
  status: StreamStatus;
  text: string;
  fullText: string;
  error: unknown | null;
  meta: Record<string, unknown>;
  startedAt: number | null;
  completedAt: number | null;
  hasBacklog: boolean;
};

export type SoftLlmStreamDebugState = {
  mode: RevealMode;
  arrivalRateCharsPerMs: number;
  predictedGapMs: number;
  jitterMs: number;
  hiddenBacklogChars: number;
  hiddenBacklogHorizonMs: number;
  reserveHorizonMs: number;
  targetHorizonMs: number;
  maxHorizonMs: number;
  visibleRateCharsPerMs: number;
  revealBudgetChars: number;
  isComplete: boolean;
  sampleCount: number;
};

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "replace"; text: string }
  | { type: "meta"; data: Record<string, unknown> }
  | { type: "done" }
  | { type: "error"; error: unknown };

export type StreamChunk = Uint8Array | string;

export type StreamSource =
  | Response
  | ReadableStream<unknown>
  | AsyncIterable<unknown>;

export type StreamSourceInput =
  | StreamSource
  | Promise<StreamSource>
  | ((signal: AbortSignal) => StreamSource | Promise<StreamSource>);

export type StreamAdapter = {
  name: string;
  consume: (
    source: StreamSource,
    context: { signal: AbortSignal },
  ) => AsyncIterable<StreamEvent>;
};

export type StreamAdapterName = "auto" | "text" | "sse" | "jsonl" | "event";

export type BuiltInStreamAdapterName = Exclude<StreamAdapterName, "auto">;

export type RevealTuningPresetName = "balanced" | "fastFirst" | "softFinish";

export type RevealTuning = {
  estimatorWindowSize: number;
  bootstrapDefaultGapMs: number;
  bootstrapSeedLookaheadMs: number;
  bootstrapMinRateCharsPerMs: number;
  bootstrapMaxRateCharsPerMs: number;
  firstPaintMinChars: number;
  estimatedRateMaxCharsPerMs: number;
  gapJitterMultiplier: number;
  reserveMinFrames: number;
  reserveMaxMs: number;
  reserveJitterWeight: number;
  targetExtraMs: number;
  targetMaxMs: number;
  protectHorizonMultiplier: number;
  catchupHorizonMultiplier: number;
  steadyControlGain: number;
  steadyMinRateFactor: number;
  steadyMaxRateFactor: number;
  protectMinRateFactor: number;
  protectRecoveryExponent: number;
  catchupMaxRateFactor: number;
  completeBaseFloorFactor: number;
  completeMaxRateFactor: number;
  completeMinDurationMs: number;
  completeMaxDurationMs: number;
  rateSettleMs: Record<RevealMode, number>;
  budgetBankFrames: Record<RevealMode, number>;
  maxStepChars: Record<RevealMode, number>;
  stepRateMultipliers: Record<RevealMode, number>;
  boundaryOvershootChars: Record<RevealMode, number>;
};

export type SoftLlmStreamDebugOptions = {
  tuning?: Partial<RevealTuning>;
};

export type CreateSoftLlmStreamOptions = {
  source: StreamSourceInput;
  adapter?: StreamAdapter | StreamAdapterName;
  locale?: string;
  autoStart?: boolean;
  reveal?: "auto" | false;
  hiddenPolicy?: "flush" | "pause";
  onEvent?: (event: StreamEvent) => void;
  revealProfile?: RevealTuningPresetName;
  debug?: SoftLlmStreamDebugOptions;
};

export type CreateSoftLlmChatStreamOptions = Omit<
  CreateSoftLlmStreamOptions,
  "adapter" | "hiddenPolicy"
> & {
  adapter?: StreamAdapter | StreamAdapterName;
  hiddenPolicy?: "flush" | "pause";
};

export type SoftLlmStreamStore = {
  readonly kind: "ramenm-soft-llm-stream";
  getSnapshot: () => StreamSnapshot;
  getDebugState: () => SoftLlmStreamDebugState;
  subscribe: (listener: () => void) => () => void;
  start: () => Promise<StreamSnapshot>;
  stop: () => Promise<void>;
  reset: () => void;
};

export const EMPTY_SNAPSHOT: StreamSnapshot = {
  status: "idle",
  text: "",
  fullText: "",
  error: null,
  meta: {},
  startedAt: null,
  completedAt: null,
  hasBacklog: false,
};

export const EMPTY_DEBUG_STATE: SoftLlmStreamDebugState = {
  mode: "bootstrap",
  arrivalRateCharsPerMs: 0,
  predictedGapMs: 0,
  jitterMs: 0,
  hiddenBacklogChars: 0,
  hiddenBacklogHorizonMs: 0,
  reserveHorizonMs: 0,
  targetHorizonMs: 0,
  maxHorizonMs: 0,
  visibleRateCharsPerMs: 0,
  revealBudgetChars: 0,
  isComplete: false,
  sampleCount: 0,
};
