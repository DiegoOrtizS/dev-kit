import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeConfig } from "../src/config.mjs";
import { worktreesClean } from "../src/guardrails/worktrees-clean.mjs";

const gitEnv = Object.entries(process.env).filter(([key]) => key.startsWith("GIT_"));
let root: string;
let repo: string;

function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
    cwd,
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function commit(cwd: string, file: string, content: string, message: string) {
  writeFileSync(path.join(cwd, file), content);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", message);
}

function worktree(name: string, branch: string) {
  const dir = path.join(root, name);
  git(repo, "worktree", "add", "-q", "-b", branch, dir);
  return dir;
}

function squash(branch: string, message: string) {
  git(repo, "merge", "-q", "--squash", branch);
  git(repo, "commit", "-q", "-m", message);
}

function branches() {
  return git(repo, "branch", "--format=%(refname:lstrip=2)").split("\n").sort();
}

function clean(...args: string[]) {
  return worktreesClean(normalizeConfig({ worktrees: { base: "main" } }), args, repo);
}

beforeAll(() => {
  for (const [key] of gitEnv) delete process.env[key];
});

afterAll(() => {
  for (const [key, value] of gitEnv) process.env[key] = value;
});

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  root = mkdtempSync(path.join(tmpdir(), "worktrees-clean-"));
  repo = path.join(root, "repo");
  git(root, "init", "-q", "-b", "main", repo);
  commit(repo, "README.md", "x\n", "chore: init");
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("worktrees-clean", () => {
  it("deletes squash-merged branches and removes their clean worktrees", () => {
    git(repo, "checkout", "-q", "-b", "feature");
    commit(repo, "feature.txt", "one\n", "wip");
    commit(repo, "feature.txt", "one\ntwo\n", "wip again");
    git(repo, "checkout", "-q", "main");
    const tree = worktree("wt-squash", "squashed");
    commit(tree, "other.txt", "other\n", "wip");
    squash("feature", "feat: add feature (#5)");
    squash("squashed", "feat: add other (#6)");
    commit(repo, "later.txt", "later\n", "chore: later");

    const lines = clean("--apply");

    expect(branches()).toEqual(["main"]);
    expect(existsSync(tree)).toBe(false);
    expect(lines).toContain("delete branch feature: changes already in main");
  });

  it("keeps branches whose tip subject matches a base commit but whose changes are not in base", () => {
    commit(repo, "deps.txt", "2\n", "chore(deps): bump x (#12)");
    git(repo, "checkout", "-q", "-b", "feature", "HEAD~1");
    commit(repo, "work.txt", "unmerged\n", "chore(deps): bump x");
    git(repo, "checkout", "-q", "main");
    const tree = worktree("wt-same", "same-subject");
    commit(tree, "more.txt", "unmerged\n", "chore: init");

    const lines = clean("--apply");

    expect(branches()).toEqual(["feature", "main", "same-subject"]);
    expect(existsSync(path.join(tree, "more.txt"))).toBe(true);
    expect(lines.filter((line) => !line.startsWith("keep"))).toEqual([]);
  });

  it("keeps a branch whose changes conflict with base", () => {
    git(repo, "checkout", "-q", "-b", "feature");
    commit(repo, "shared.txt", "mine\n", "feat: shared");
    git(repo, "checkout", "-q", "main");
    commit(repo, "shared.txt", "theirs\n", "feat: shared (#3)");

    clean("--apply");

    expect(branches()).toEqual(["feature", "main"]);
  });

  it("deletes a branch that was fast-forwarded into base", () => {
    git(repo, "checkout", "-q", "-b", "feature");
    commit(repo, "a.txt", "a\n", "feat: a");
    git(repo, "checkout", "-q", "main");
    git(repo, "merge", "-q", "--ff-only", "feature");

    const lines = clean("--apply");

    expect(branches()).toEqual(["main"]);
    expect(lines).toContain("delete branch feature: commit already in main");
  });

  it("keeps worktrees with uncommitted changes even when their branch is merged", () => {
    const untracked = worktree("wt-untracked", "untracked");
    const modified = worktree("wt-modified", "modified");
    writeFileSync(path.join(untracked, "notes.txt"), "draft\n");
    writeFileSync(path.join(modified, "README.md"), "edited\n");

    const lines = clean("--apply");

    expect(existsSync(path.join(untracked, "notes.txt"))).toBe(true);
    expect(existsSync(path.join(modified, "README.md"))).toBe(true);
    expect(branches()).toEqual(["main", "modified", "untracked"]);
    expect(lines.filter((line) => line.endsWith(": uncommitted changes"))).toHaveLength(2);
  });

  it("only reports without --apply", () => {
    git(repo, "branch", "feature");
    const tree = worktree("wt-merged", "merged");

    const lines = clean();

    expect(branches()).toEqual(["feature", "main", "merged"]);
    expect(existsSync(tree)).toBe(true);
    expect(lines).toContain("would delete branch feature: commit already in main");
    expect(lines.at(-1)).toBe("dry run; pass --apply to remove");
  });
});
