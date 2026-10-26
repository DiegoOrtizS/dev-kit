import type { DevKitConfig } from "../config.mjs";

export function mergedInto(commit: string, base: string, cwd?: string): string | null;
export function worktreesClean(config: DevKitConfig, args: string[], repoRoot?: string): string[];
