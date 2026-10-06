import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_PATH = ".claude/guard.json";

const DEFAULT_CHECKS = [
  ["format", "pnpm format:check"],
  ["lint", "pnpm lint"],
  ["typecheck", "pnpm typecheck"],
  ["test", "pnpm test"],
];

export const DEFAULT_CONFIG = Object.freeze({
  protectedBranches: { main: { allowedPaths: [], allowMerges: false, blockAgentPush: true } },
  blockedPaths: { read: [], write: [], commit: [] },
  secretScan: { skipFiles: ["pnpm-lock.yaml"] },
  lint: [],
  checks: DEFAULT_CHECKS,
  worktrees: { base: "origin/main" },
});

function toRegExps(patterns, field) {
  if (!Array.isArray(patterns) || patterns.some((pattern) => typeof pattern !== "string")) {
    throw new Error(`${CONFIG_PATH}: ${field} must be a list of regular expressions`);
  }
  return patterns.map((pattern) => new RegExp(pattern));
}

function normalizeBranches(branches) {
  return Object.fromEntries(
    Object.entries(branches).map(([name, rules]) => [
      name,
      {
        allowedPaths: toRegExps(rules.allowedPaths ?? [], `protectedBranches.${name}.allowedPaths`),
        allowMerges: rules.allowMerges === true,
        blockAgentPush: rules.blockAgentPush !== false,
      },
    ]),
  );
}

function normalizeLint(rules) {
  if (!Array.isArray(rules)) throw new Error(`${CONFIG_PATH}: lint must be a list`);
  return rules.map((rule, index) => {
    if (typeof rule?.match !== "string" || !Array.isArray(rule.command) || rule.command.length === 0) {
      throw new Error(`${CONFIG_PATH}: lint[${index}] needs "match" and a non-empty "command"`);
    }
    return { match: new RegExp(rule.match), command: rule.command.map(String) };
  });
}

export function normalizeConfig(raw = {}) {
  const merged = { ...DEFAULT_CONFIG, ...raw };
  const blocked = { ...DEFAULT_CONFIG.blockedPaths, ...merged.blockedPaths };
  return {
    protectedBranches: normalizeBranches(merged.protectedBranches),
    blockedPaths: {
      read: toRegExps(blocked.read, "blockedPaths.read"),
      write: toRegExps(blocked.write, "blockedPaths.write"),
      commit: toRegExps(blocked.commit, "blockedPaths.commit"),
    },
    secretScan: { skipFiles: new Set(merged.secretScan?.skipFiles ?? DEFAULT_CONFIG.secretScan.skipFiles) },
    lint: normalizeLint(merged.lint),
    checks: merged.checks,
    worktrees: { base: merged.worktrees?.base ?? DEFAULT_CONFIG.worktrees.base },
  };
}

export function loadConfig(repoRoot) {
  const path = join(repoRoot, CONFIG_PATH);
  if (!existsSync(path)) return normalizeConfig();
  return normalizeConfig(JSON.parse(readFileSync(path, "utf8")));
}
