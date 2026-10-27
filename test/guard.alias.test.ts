import { describe, expect, it, vi } from "vitest";
import { normalizeConfig } from "../src/config.mjs";
import { evaluateToolCall } from "../src/guard/guard.mjs";
import { expandGitAlias } from "../src/guard/git-alias.mjs";
import type { GuardIo } from "../src/guard/io.mjs";

const repoRoot = "/work/tcg";
const aliasIo = (aliases: Record<string, string>, spy?: string[]): GuardIo => ({
  gitAlias: (name: string) => {
    spy?.push(name);
    return aliases[name.toLowerCase()] ?? null;
  },
  readTextFile: () => null,
});
const run = (command: string, io: GuardIo, cwd = repoRoot, budgetMs?: number) =>
  evaluateToolCall({ tool_name: "Bash", tool_input: { command }, cwd }, { repoRoot, io, budgetMs });
const psRun = (command: string, io: GuardIo) =>
  evaluateToolCall({ tool_name: "PowerShell", tool_input: { command }, cwd: repoRoot }, { repoRoot, io });
const aliasContext = (io: GuardIo) => ({
  cwd: repoRoot,
  repoRoot,
  config: normalizeConfig(),
  io,
  aliasCache: new Map<string, string | null>(),
  deadline: Date.now() + 1000,
});

describe("! alias keeps its argument quoting", () => {
  const io = aliasIo({ x: "!exec " });

  it("blocks a forbidden command passed as a quoted alias argument", () => {
    expect(run("git x bash -c 'git push -f'", io).block).toBe(true);
  });

  it("allows a harmless command passed the same way", () => {
    expect(run("git x bash -c 'git status'", io)).toEqual({ block: false });
  });

  it("shell-quotes each appended argument when expanding", () => {
    const expansion = expandGitAlias(["x", "bash", "-c", "git push -f"], aliasContext(io));
    expect(expansion).not.toBeNull();
    if (expansion === null || !("script" in expansion)) throw new Error("expected a script");
    expect(expansion.script).toContain("'git push -f'");
  });
});

describe("alias lookup when the repository context is uncertain", () => {
  const spy: string[] = [];
  const io = aliasIo({ st2: "status", nuke: "reset --hard" }, spy);

  it.each([
    "cd ../other-repo && git st2",
    "pushd ../other-repo; git st2",
    "GIT_DIR=../other-repo/.git git st2",
    "GIT_WORK_TREE=../other git st2",
    "export GIT_DIR=../other/.git && git nuke",
  ])("asks before %s", (command) => {
    const verdict = run(command, io);
    expect(verdict).toMatchObject({ block: false, ask: true });
    expect(verdict.reason).toMatch(/could not tell|repo/i);
  });

  it("asks before a Set-Location before a git alias in powershell", () => {
    expect(psRun("Set-Location ../other; git st2", io)).toMatchObject({ block: false, ask: true });
  });

  it("asks before a $env:GIT_DIR assignment before a git alias in powershell", () => {
    expect(psRun("$env:GIT_DIR = '../other/.git'; git st2", io)).toMatchObject({ block: false, ask: true });
  });

  it("still resolves the alias normally without a directory change", () => {
    expect(run("git st2", io)).toEqual({ block: false });
    expect(run("git nuke", io).block).toBe(true);
  });
});

describe("alias lookups are bounded in time", () => {
  it("asks without spawning once the per-evaluation budget is spent", () => {
    const spy: string[] = [];
    const io = aliasIo({ foo: "status" }, spy);
    const verdict = run("git foo", io, repoRoot, 0);
    expect(verdict).toMatchObject({ block: false, ask: true });
    expect(spy).toEqual([]);
  });

  it("looks a repeated subcommand up only once per evaluation", () => {
    const spy: string[] = [];
    const io = aliasIo({ foo: "status" }, spy);
    run("git foo && git foo && git foo", io);
    expect(spy).toEqual(["foo"]);
  });
});

describe("builtin subcommands never spawn a lookup", () => {
  it("does not call gitAlias for builtins", () => {
    const gitAlias = vi.fn(() => null);
    const io = { gitAlias, readTextFile: () => null };
    for (const command of ["git status", "git push origin x", "git commit -m y", "git -C . log", "git worktree list"]) {
      evaluateToolCall({ tool_name: "Bash", tool_input: { command }, cwd: repoRoot }, { repoRoot, io });
    }
    expect(gitAlias).not.toHaveBeenCalled();
  });
});
