export function findStartPaths(args: string[]): string[];
export function findDeleteTargets(args: string[]): string[];
import type { GuardContext, Verdict } from "./guard.mjs";
import type { Dialect } from "./dialects.mjs";
export function checkFindExec(
  args: string[],
  context: GuardContext,
  dialect: Dialect,
  checkWords: (words: string[], context: GuardContext, dialect: Dialect) => Verdict,
): Verdict;
