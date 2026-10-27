import { findSecrets } from "../guardrails/rules.mjs";
import { GIT_HOOKS_ASK, OWN_LIMITS_ASK, matchesBlockedPath, touchesGitHooks, touchesOwnLimits } from "./env-files.mjs";
import { ALLOW, deny, firstBlock } from "./verdict.mjs";

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

function collectWrittenText(toolName, toolInput) {
  if (toolName === "Write") return [toolInput.content];
  if (toolName === "Edit") return [toolInput.new_string];
  if (toolName === "NotebookEdit") return [toolInput.new_source];
  if (toolName === "MultiEdit" && Array.isArray(toolInput.edits)) {
    return toolInput.edits.map((edit) => edit?.new_string);
  }
  return [];
}

function checkWrittenText(toolName, toolInput) {
  for (const text of collectWrittenText(toolName, toolInput)) {
    if (typeof text !== "string") continue;
    const [finding] = findSecrets(text);
    if (finding) {
      return deny(
        `Blocked: the content looks like a secret (${finding.rule}, line ${finding.line}). Keep secrets in the platform's secret store and environment variables, never in the repository.`,
      );
    }
  }
  return ALLOW;
}

function checkFilePath(toolName, input, context) {
  const path = input.file_path ?? input.notebook_path;
  if (typeof path !== "string") return ALLOW;
  const { blockedPaths } = context.config;
  if (WRITE_TOOLS.has(toolName) && matchesBlockedPath(path, blockedPaths.write, context)) {
    return deny("Blocked: this path is off limits for writing in this repository (.claude/guard.json).");
  }
  if (toolName === "Read" && matchesBlockedPath(path, blockedPaths.read, context)) {
    return deny("Blocked: this path is off limits for reading in this repository (.claude/guard.json).");
  }
  if (WRITE_TOOLS.has(toolName) && touchesOwnLimits(path, context)) return OWN_LIMITS_ASK;
  if (WRITE_TOOLS.has(toolName) && touchesGitHooks(path)) return GIT_HOOKS_ASK;
  return ALLOW;
}

export function checkFileTool(toolName, input, context) {
  return firstBlock([checkFilePath(toolName, input, context), checkWrittenText(toolName, input)]);
}
