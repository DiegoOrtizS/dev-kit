export function hasGlob(text: string): boolean;
export function expandBraces(word: string): string[];
export function isWholeDirectorySegment(segment: string): boolean;
export function globRegExp(path: string, options?: { crossSlash?: boolean }): RegExp;
export function normalizeGlobs(path: string): string;
