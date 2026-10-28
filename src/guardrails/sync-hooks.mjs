import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SETTINGS_PATH = ".claude/settings.json";
const GUARD_SHIM = "claude-hooks/guard.mjs";

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function guardHooks(entry) {
  return Array.isArray(entry?.hooks)
    ? entry.hooks.filter((hook) => typeof hook?.command === "string" && hook.command.includes(GUARD_SHIM))
    : [];
}

function guardEntries(settings) {
  const entries = Array.isArray(settings?.hooks?.PreToolUse) ? settings.hooks.PreToolUse : [];
  return entries.filter((entry) => guardHooks(entry).length > 0);
}

function coversTool(matcher, tool) {
  if (matcher === undefined || matcher === "" || matcher === "*") return true;
  if (typeof matcher !== "string") return false;
  try {
    return new RegExp(`^(?:${matcher})$`).test(tool);
  } catch {
    return matcher === tool;
  }
}

export function checkHookMatchers(repoRoot) {
  const path = join(repoRoot, SETTINGS_PATH);
  if (!existsSync(path)) return [];
  let settings;
  try {
    settings = readJson(path);
  } catch {
    return [];
  }
  const templateEntries = guardEntries(readJson(join(KIT_ROOT, "templates", "claude", "settings.json")));
  const templateMatcher = templateEntries.map((entry) => entry.matcher).join("|");
  const entries = guardEntries(settings);
  if (entries.length === 0) {
    return [
      `${SETTINGS_PATH}: no PreToolUse hook runs tools/${GUARD_SHIM}; copy the hooks block from dev-kit templates/claude/settings.json`,
    ];
  }
  const problems = [];
  const missing = templateMatcher
    .split("|")
    .filter((tool) => !entries.some((entry) => coversTool(entry.matcher, tool)));
  if (missing.length > 0) {
    problems.push(
      `${SETTINGS_PATH}: the PreToolUse matcher for tools/${GUARD_SHIM} lacks ${missing.join(", ")}; the template has "${templateMatcher}"`,
    );
  }
  const templateBlocks = guardEntries(readJson(join(KIT_ROOT, "templates", "claude", "settings.json"))).some((entry) =>
    guardHooks(entry).some((hook) => hook.onFailure === "block"),
  );
  const consumerBlocks = entries.some((entry) => guardHooks(entry).some((hook) => hook.onFailure === "block"));
  if (templateBlocks && !consumerBlocks) {
    problems.push(
      `${SETTINGS_PATH}: the tools/${GUARD_SHIM} hook is missing "onFailure": "block"; without it a timed-out guard lets the call through (Claude Code >= 2.1.295). Copy it from dev-kit templates/claude/settings.json`,
    );
  }
  return problems;
}
