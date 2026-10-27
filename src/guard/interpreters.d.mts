import type { Dialect } from "./dialects.mjs";
import type { Verdict } from "./guard.mjs";

export const INTERPRETERS: Set<string>;
export function checkInlineCode(name: string, args: string[]): Verdict;
export function checkDotNetFileCalls(script: string, dialect: Dialect): Verdict;
