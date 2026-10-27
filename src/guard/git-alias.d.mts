import type { GuardContext, Verdict } from "./guard.mjs";

export type GitAliasExpansion = { verdict: Verdict } | { script: string; dynamic: boolean } | { args: string[] };

export const SHELL_ALIAS_WITH_ARGUMENTS: Verdict;
export function expandGitAlias(args: string[], context: GuardContext): GitAliasExpansion | null;
