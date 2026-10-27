import type { GuardContext, Verdict } from "./guard.mjs";

export function checkGitPaths(subcommand: string, rest: string[], context: GuardContext): Verdict;
