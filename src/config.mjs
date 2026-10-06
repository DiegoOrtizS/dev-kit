import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_PATH = ".claude/guard.json";

const DEFAULT_CHECKS = [
  ["format", "pnpm format:check"],
  ["lint", "pnpm lint"],
  ["typecheck", "pnpm typecheck"],
  ["test", "pnpm test"],
];

const TOP_LEVEL_KEYS = ["protectedBranches", "blockedPaths", "secretScan", "lint", "checks", "worktrees", "syncCheck"];
const BRANCH_KEYS = ["allowedPaths", "allowMerges", "blockAgentPush"];
const BLOCKED_PATH_KEYS = ["read", "write", "commit"];
const ALWAYS_PROTECTED = "main";

function fail(message) {
  throw new Error(`${CONFIG_PATH}: ${message}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, field, allowedKeys) {
  if (!isPlainObject(value)) fail(`${field} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowedKeys.includes(key));
  if (unknown.length > 0) fail(`${field} has unknown keys: ${unknown.join(", ")}`);
  return value;
}

function requireBoolean(value, field, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(`${field} must be true or false`);
  return value;
}

function toRegExps(patterns, field, flags = "") {
  if (!Array.isArray(patterns) || patterns.some((pattern) => typeof pattern !== "string")) {
    fail(`${field} must be a list of regular expressions`);
  }
  return patterns.map((pattern) => new RegExp(pattern, flags));
}

function normalizeBranch(name, rules) {
  const field = `protectedBranches.${name}`;
  requireObject(rules, field, BRANCH_KEYS);
  const blockAgentPush = requireBoolean(rules.blockAgentPush, `${field}.blockAgentPush`, true);
  return {
    allowedPaths: toRegExps(rules.allowedPaths ?? [], `${field}.allowedPaths`),
    allowMerges: requireBoolean(rules.allowMerges, `${field}.allowMerges`, false),
    blockAgentPush: name === ALWAYS_PROTECTED ? true : blockAgentPush,
  };
}

function normalizeBranches(branches = {}) {
  requireObject(branches, "protectedBranches", Object.keys(branches));
  const withMain = { [ALWAYS_PROTECTED]: {}, ...branches };
  return Object.fromEntries(Object.entries(withMain).map(([name, rules]) => [name, normalizeBranch(name, rules)]));
}

function normalizeBlockedPaths(blocked = {}) {
  requireObject(blocked, "blockedPaths", BLOCKED_PATH_KEYS);
  const flags = process.platform === "win32" ? "i" : "";
  return Object.fromEntries(
    BLOCKED_PATH_KEYS.map((key) => [key, toRegExps(blocked[key] ?? [], `blockedPaths.${key}`, flags)]),
  );
}

function normalizeLint(rules = []) {
  if (!Array.isArray(rules)) fail("lint must be a list");
  return rules.map((rule, index) => {
    if (typeof rule?.match !== "string" || !Array.isArray(rule.command) || rule.command.length === 0) {
      fail(`lint[${index}] needs "match" and a non-empty "command"`);
    }
    return { match: new RegExp(rule.match), command: rule.command.map(String) };
  });
}

function normalizeChecks(checks = DEFAULT_CHECKS) {
  const valid =
    Array.isArray(checks) &&
    checks.every((step) => Array.isArray(step) && step.length === 2 && step.every((part) => typeof part === "string"));
  if (!valid) fail("checks must be a list of [name, command] pairs");
  return checks;
}

function normalizeSecretScan(secretScan = {}) {
  requireObject(secretScan, "secretScan", ["skipFiles"]);
  const skipFiles = secretScan.skipFiles ?? ["pnpm-lock.yaml"];
  if (!Array.isArray(skipFiles) || skipFiles.some((file) => typeof file !== "string")) {
    fail("secretScan.skipFiles must be a list of paths");
  }
  return { skipFiles: new Set(skipFiles) };
}

function normalizeWorktrees(worktrees = {}) {
  requireObject(worktrees, "worktrees", ["base"]);
  if (worktrees.base !== undefined && typeof worktrees.base !== "string") fail("worktrees.base must be a string");
  return { base: worktrees.base ?? "origin/main" };
}

function normalizeSyncCheck(syncCheck = {}) {
  requireObject(syncCheck, "syncCheck", ["agentOverrides"]);
  const overrides = syncCheck.agentOverrides ?? {};
  requireObject(overrides, "syncCheck.agentOverrides", Object.keys(overrides));
  for (const [agent, fields] of Object.entries(overrides)) {
    if (!Array.isArray(fields) || fields.some((field) => typeof field !== "string")) {
      fail(`syncCheck.agentOverrides.${agent} must be a list of field names`);
    }
  }
  return { agentOverrides: overrides };
}

export function normalizeConfig(raw = {}) {
  requireObject(raw, "the config", TOP_LEVEL_KEYS);
  return {
    protectedBranches: normalizeBranches(raw.protectedBranches),
    blockedPaths: normalizeBlockedPaths(raw.blockedPaths),
    secretScan: normalizeSecretScan(raw.secretScan),
    lint: normalizeLint(raw.lint),
    checks: normalizeChecks(raw.checks),
    worktrees: normalizeWorktrees(raw.worktrees),
    syncCheck: normalizeSyncCheck(raw.syncCheck),
  };
}

export function loadConfig(repoRoot) {
  const path = join(repoRoot, CONFIG_PATH);
  if (!existsSync(path)) return normalizeConfig();
  return normalizeConfig(JSON.parse(readFileSync(path, "utf8")));
}
