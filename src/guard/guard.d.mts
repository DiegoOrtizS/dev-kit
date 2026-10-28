import type { DevKitConfig } from "../config.mjs";
import type { GuardIo } from "./io.mjs";

export interface ToolCall {
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd?: string;
}

export interface Verdict {
  block: boolean;
  ask?: boolean;
  reason?: string;
}

export interface GuardContext {
  cwd: string;
  repoRoot: string;
  config: DevKitConfig;
  io: GuardIo;
  aliasCache?: Map<string, string | null>;
  deadline?: number;
  aliasUncertain?: boolean;
}

export interface EvaluateOptions {
  repoRoot?: string;
  config?: DevKitConfig;
  io?: Partial<GuardIo>;
  budgetMs?: number;
}

export function evaluateToolCall(input: ToolCall, options?: EvaluateOptions): Verdict;
export function runGuard(options: { repoRoot: string }): void;
