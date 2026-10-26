import type { DevKitConfig } from "../config.mjs";

export const TYPES: string[];
export const MAX_HEADER: number;
export function isExempt(header: string): boolean;
export function headerOf(message: string, options?: { stripComments?: boolean }): string;
export function headerProblems(header: string): string[];
export function commitProblems(args: string[], cwd: string): string[];
export function checkCommit(config: DevKitConfig, args: string[], repoRoot?: string): void;
