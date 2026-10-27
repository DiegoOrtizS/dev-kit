import type { Dialect } from "./dialects.mjs";
import type { Verdict } from "./guard.mjs";

export const INTERPRETERS: Set<string>;
export function checkInlineCode(name: string, args: string[]): Verdict;
export function checkDotNetFileCalls(script: string, dialect: Dialect): Verdict;
export function checkInterpreterInput(
  name: string,
  args: string[],
  input: { text: string } | { files: string[] } | { unknown: true } | undefined,
  readTextFile: (path: string) => string | null,
): Verdict;
