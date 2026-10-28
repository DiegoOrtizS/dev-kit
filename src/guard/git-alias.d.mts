import type { GuardContext, Verdict } from "./guard.mjs";

export type GitAliasExpansion = { verdict: Verdict } | { script: string; dynamic: boolean } | { args: string[] };

export const SHELL_ALIAS_WITH_ARGUMENTS: Verdict;
export function expandGitAlias(args: string[], context: GuardContext): GitAliasExpansion | null;
import type { Dialect } from "./dialects.mjs";

export function segmentChangesRepo(words: string[], dialect: Dialect): boolean;
export function globalRepoChange(script: string, dialect: Dialect): boolean;
export const UNRESOLVED_ALIAS: Verdict;
