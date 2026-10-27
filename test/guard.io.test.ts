import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const settingsPatch = "--- a/.claude/settings.json\n+++ b/.claude/settings.json\n@@ -1 +1 @@\n-{}\n+{}\n";
const ordinaryPatch = "--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1 +1 @@\n-a\n+b\n";

const gitEnv = Object.entries(process.env).filter(([key]) => key.startsWith("GIT_"));
let root = "";
let repo = "";
let broken = "";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "ignore" });
const setAlias = (directory: string, name: string, value: string) =>
  git(directory, `--git-dir=${path.join(directory, ".git")}`, "config", `alias.${name}`, value);
const run = (command: string, cwd: string) =>
  evaluateToolCall({ tool_name: "Bash", tool_input: { command }, cwd }, { repoRoot: cwd });
const gitBashPath = (windowsPath: string) =>
  windowsPath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);

beforeAll(() => {
  for (const [key] of gitEnv) delete process.env[key];
  root = mkdtempSync(path.join(tmpdir(), "dev-kit-guard-io-"));
  writeFileSync(path.join(root, "global.gitconfig"), "");
  vi.stubEnv("GIT_CONFIG_GLOBAL", path.join(root, "global.gitconfig"));
  vi.stubEnv("GIT_CONFIG_NOSYSTEM", "1");
  repo = path.join(root, "repo");
  broken = path.join(root, "broken");
  for (const directory of [repo, broken]) {
    mkdirSync(directory);
    git(directory, "init", "-q", directory);
    expect(existsSync(path.join(directory, ".git", "config"))).toBe(true);
  }
  setAlias(repo, "nuke", "reset --hard");
  setAlias(repo, "st", "status");
  appendFileSync(path.join(broken, ".git", "config"), "\n[alias\n");
  writeFileSync(path.join(repo, "evil.patch"), settingsPatch);
  writeFileSync(path.join(repo, "fix.diff"), ordinaryPatch);
  mkdirSync(path.join(repo, "patches"));
});

afterAll(() => {
  vi.unstubAllEnvs();
  for (const [key, value] of gitEnv) process.env[key] = value;
  rmSync(root, { recursive: true, force: true });
});

describe("git aliases read from the real config", () => {
  it("blocks an alias that hides git reset --hard", () => {
    expect(run("git nuke", repo).block).toBe(true);
  });

  it("allows a harmless alias and an unknown subcommand", () => {
    expect(run("git st", repo)).toEqual({ block: false });
    expect(run("git no-such-alias", repo)).toEqual({ block: false });
  });

  it("asks when git cannot read its config", () => {
    expect(run("git nuke", broken)).toMatchObject({ block: false, ask: true });
  });

  it("asks when git cannot run in the working directory", () => {
    expect(run("git nuke", path.join(root, "missing"))).toMatchObject({ block: false, ask: true });
  });
});

describe("patch files read from disk", () => {
  it("asks before a patch that rewrites the agent's settings", () => {
    expect(run("git apply evil.patch", repo)).toMatchObject({ block: false, ask: true });
  });

  it("allows an ordinary patch", () => {
    expect(run("git apply fix.diff", repo)).toEqual({ block: false });
  });

  it("asks when the patch is a directory", () => {
    expect(run("git apply patches", repo)).toMatchObject({ block: false, ask: true });
  });

  it.runIf(process.platform === "win32")("reads a Git Bash path on Windows", () => {
    expect(run(`git apply ${gitBashPath(repo)}/evil.patch`, repo)).toMatchObject({ block: false, ask: true });
  });
});
