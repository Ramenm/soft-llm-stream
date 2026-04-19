export type CodeFenceState = {
    open: boolean;
    tail: string;
};
export type SliceSelectionOptions = {
    locale: string;
    insideCodeFence: boolean;
    maxChars: number;
    maxOvershootChars: number;
    preferBoundary?: boolean;
};
export declare function createCodeFenceState(): CodeFenceState;
export declare function advanceCodeFenceState(state: CodeFenceState, appendedText: string): CodeFenceState;
export declare function getCodeFenceState(text: string): CodeFenceState;
export declare function findGraphemeBoundary(text: string, targetLength: number, locale: string): number;
export declare function getSliceSearchWindowChars(maxChars: number): number;
export declare function chooseSliceLength(remaining: string, preferredChars: number, options: SliceSelectionOptions): number;
