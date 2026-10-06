import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, normalizeConfig } from "../src/config.mjs";

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "dev-kit-config-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(value: unknown) {
  mkdirSync(path.join(root, ".claude"), { recursive: true });
  writeFileSync(path.join(root, ".claude", "guard.json"), JSON.stringify(value));
}

describe("loadConfig", () => {
  it("falls back to defaults without a config file", () => {
    const config = loadConfig(root);
    expect(Object.keys(config.protectedBranches)).toEqual(["main"]);
    expect(config.protectedBranches.main?.blockAgentPush).toBe(true);
    expect(config.protectedBranches.main?.allowedPaths).toEqual([]);
    expect(config.lint).toEqual([]);
    expect(config.worktrees.base).toBe("origin/main");
    expect(config.secretScan.skipFiles.has("pnpm-lock.yaml")).toBe(true);
  });

  it("reads branches, paths, lint and worktrees from .claude/guard.json", () => {
    writeConfig({
      protectedBranches: { main: { allowMerges: true }, develop: { allowedPaths: ["^docs/"], blockAgentPush: false } },
      blockedPaths: { commit: ["^state/"] },
      lint: [{ match: "\\.py$", command: ["ruff", "check", "{file}"] }],
      worktrees: { base: "origin/develop" },
    });
    const config = loadConfig(root);
    expect(config.protectedBranches.develop?.allowedPaths[0]?.test("docs/a.md")).toBe(true);
    expect(config.protectedBranches.develop?.blockAgentPush).toBe(false);
    expect(config.protectedBranches.main?.allowMerges).toBe(true);
    expect(config.blockedPaths.commit[0]?.test("state/purchases.db")).toBe(true);
    expect(config.blockedPaths.read).toEqual([]);
    expect(config.lint[0]?.match.test("bot/engine.py")).toBe(true);
    expect(config.worktrees.base).toBe("origin/develop");
  });

  it("throws on invalid JSON so the guard can fail closed", () => {
    mkdirSync(path.join(root, ".claude"));
    writeFileSync(path.join(root, ".claude", "guard.json"), "{ not json");
    expect(() => loadConfig(root)).toThrow();
  });
});

describe("normalizeConfig", () => {
  it.each([
    [{ blockedPaths: { read: "profile_" } }],
    [{ protectedBranches: { main: { allowedPaths: [1] } } }],
    [{ lint: [{ match: "\\.py$" }] }],
    [{ lint: {} }],
    [{ protectedBranches: ["main", "develop"] }],
    [{ protectedBranches: { develop: ["^docs/"] } }],
    [{ protectedBranches: { main: { allowMerge: true } } }],
    [{ protectedBranches: { main: { blockAgentPush: "no" } } }],
    [{ blockedPaths: ["^state/"] }],
    [{ blockedPaths: "^state/" }],
    [{ blockedPaths: { reads: ["^state/"] } }],
    [{ blockedpaths: { read: ["^state/"] } }],
    [{ checks: [["test"]] }],
    [{ worktrees: { base: 1 } }],
    [{ secretScan: { skipFiles: "pnpm-lock.yaml" } }],
    [[]],
    [null],
  ])("rejects a malformed config %#", (raw) => {
    expect(() => normalizeConfig(raw)).toThrow(/guard\.json/);
  });

  it.each([
    [{}],
    [{ protectedBranches: { develop: {} } }],
    [{ protectedBranches: { main: { blockAgentPush: false } } }],
  ])("always keeps agent pushes to main blocked %#", (raw) => {
    expect(normalizeConfig(raw).protectedBranches.main?.blockAgentPush).toBe(true);
  });

  it("lets other branches opt out of the push block", () => {
    const config = normalizeConfig({ protectedBranches: { develop: { blockAgentPush: false } } });
    expect(config.protectedBranches.develop?.blockAgentPush).toBe(false);
  });
});

describe("syncCheck config", () => {
  it.each([
    [{ syncCheck: { agentOverrides: { mechanic: ["modle"] } } }],
    [{ syncCheck: { agentOverrides: { "Bad Name": ["model"] } } }],
    [{ syncCheck: { agentOverrides: { mechanic: "model" } } }],
    [{ syncCheck: { requiredAgents: "code-reviewer" } }],
    [{ syncCheck: { requiredAgent: ["code-reviewer"] } }],
  ])("rejects %j", (raw) => {
    expect(() => normalizeConfig(raw)).toThrow(/guard\.json/);
  });

  it("accepts overrides and required agents", () => {
    const config = normalizeConfig({
      syncCheck: { agentOverrides: { "security-auditor": ["tools"] }, requiredAgents: ["code-reviewer"] },
    });
    expect(config.syncCheck.requiredAgents).toEqual(["code-reviewer"]);
  });
});
