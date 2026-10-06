import type { DevKitConfig } from "../config.mjs";

export interface ToolCall {
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd?: string;
}

export interface Verdict {
  block: boolean;
  reason?: string;
}

export interface EvaluateOptions {
  repoRoot?: string;
  config?: DevKitConfig;
}

export function evaluateToolCall(input: ToolCall, options?: EvaluateOptions): Verdict;
export function runGuard(options: { repoRoot: string }): void;
