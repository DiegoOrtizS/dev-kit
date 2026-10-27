import type { Dialect } from "./dialects.mjs";
import type { Verdict } from "./guard.mjs";

export const HIDDEN_COMMAND: Verdict;
export function aliasDefinitions(name: string, args: string[], dialect: Dialect): string[];
export function hidesCommand(definitions: string[]): boolean;
