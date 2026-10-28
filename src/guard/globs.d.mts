export function hasGlob(text: string): boolean;
export function expandBraces(word: string): string[];
export function isWholeDirectorySegment(segment: string): boolean;
export function globMatch(pattern: string, text: string, options?: { crossSlash?: boolean }): boolean;
export function normalizeGlobs(path: string): string;
