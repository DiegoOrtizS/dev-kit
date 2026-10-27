import type { GuardContext, Verdict } from "./guard.mjs";

export function checkFileTool(toolName: string, input: Record<string, unknown>, context: GuardContext): Verdict;
