import type { Dialect } from "./dialects.mjs";
import type { Verdict } from "./guard.mjs";
import type { Found } from "./segments.mjs";

export const EXPRESSION_RUNNERS: Set<string>;
export function unreadableScript(name: string): Verdict;
export function isDynamic(text: string): boolean;
export function isDynamicCommand(command: string, args: string[], dialect: Dialect): boolean;
export type SegmentInput = { text: string } | { files: string[]; redirected?: string } | { unknown: true };

export function segmentInputs(found: Found, dialect: Dialect): Map<string[], SegmentInput>;
export function stdinScripts(
  found: Found,
  dialect: Dialect,
): { scripts: { script: string; dialect: Dialect }[]; opaque: string[] };
