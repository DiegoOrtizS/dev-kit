import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { commitProblems } from "../src/guardrails/commit-message.mjs";

const binPath = path.resolve(__dirname, "..", "bin", "dev-kit.mjs");
const gitEnv = Object.entries(process.env).filter(([key]) => key.startsWith("GIT_"));
let repo: string;

function git(...args: string[]) {
  const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
    cwd: repo,
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

let counter = 0;

function commit(message: string, author = "t <t@example.com>") {
  const file = `file-${counter++}.txt`;
  writeFileSync(path.join(repo, file), "x\n");
  git("add", file);
  git("commit", "-q", "--author", author, "-m", message);
  return git("rev-parse", "HEAD");
}

function checkCommit(...args: string[]) {
  return spawnSync(process.execPath, [binPath, "check-commit", ...args], { cwd: repo, encoding: "utf8" });
}

beforeAll(() => {
  for (const [key] of gitEnv) delete process.env[key];
});

afterAll(() => {
  for (const [key, value] of gitEnv) process.env[key] = value;
});

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "check-commit-"));
  git("init", "-q", "-b", "main");
  commit("chore: start");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("check-commit <file>", () => {
  it("accepts a conventional message with git's comment lines", () => {
    const file = path.join(repo, "COMMIT_EDITMSG");
    writeFileSync(file, "feat: add the thing\n\n# Please enter the commit message for your changes.\n");
    expect(commitProblems([file], repo)).toEqual([]);
    expect(checkCommit(file).status).toBe(0);
  });

  it("rejects a bad message with the header and the reasons", () => {
    const file = path.join(repo, "COMMIT_EDITMSG");
    writeFileSync(file, "Added the thing.\n");
    const problems = commitProblems([file], repo);
    expect(problems.join("\n")).toContain("Added the thing.");
    const result = checkCommit(file);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Added the thing.");
    expect(result.stderr).toMatch(/type/);
  });

  it.each([
    "Merge branch 'main' into feat/x\n",
    'Revert "feat: thing"\n\nThis reverts commit abc.\n',
    "fixup! feat: thing\n",
  ])("lets git's own message %j through", (message) => {
    const file = path.join(repo, "COMMIT_EDITMSG");
    writeFileSync(file, message);
    expect(commitProblems([file], repo)).toEqual([]);
  });

  it("does not exempt a hand-written merge-like message", () => {
    const file = path.join(repo, "COMMIT_EDITMSG");
    writeFileSync(file, "Merge the things\n");
    expect(commitProblems([file], repo)).toHaveLength(1);
  });
});

describe("check-commit --message", () => {
  it("checks the text as a header", () => {
    expect(commitProblems(["--message", "feat(ci): add the commits job"], repo)).toEqual([]);
    expect(commitProblems(["--message", "Add the commits job"], repo).join("\n")).toMatch(/type/);
  });

  it("uses only the first line of a multi-line text", () => {
    expect(commitProblems(["--message", "feat: thing\n\nnot a header."], repo)).toEqual([]);
  });

  it.each(["Merge branch 'main' into feat/x", "Merge the things", "Revert deploy", 'Revert "feat: thing"', "fixup! x"])(
    "never exempts a title, so %j fails",
    (title) => {
      expect(commitProblems(["--message", title], repo)).toHaveLength(1);
      expect(checkCommit("--message", title).status).toBe(1);
    },
  );

  it("fails through the bin with exit code 1", () => {
    const result = checkCommit("--message", "wip");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("wip");
  });
});

describe("check-commit --range", () => {
  it("passes when every commit in the range is conventional", () => {
    const base = git("rev-parse", "HEAD");
    commit("feat: one");
    commit("fix(scope): two");
    expect(commitProblems(["--range", `${base}..HEAD`], repo)).toEqual([]);
    expect(checkCommit("--range", `${base}..HEAD`).status).toBe(0);
  });

  it("reports each bad commit with its short sha and leaves good ones alone", () => {
    const base = git("rev-parse", "HEAD");
    const bad = commit("Bad one");
    commit("feat: good one");
    const worse = commit("feat: ends with a period.");
    const problems = commitProblems(["--range", `${base}..HEAD`], repo);
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain(bad.slice(0, 7));
    expect(problems.join("\n")).toContain(worse.slice(0, 7));
    expect(problems.join("\n")).not.toContain("good one");
    const result = checkCommit("--range", `${base}..HEAD`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Bad one");
  });

  it("skips merge commits", () => {
    const base = git("rev-parse", "HEAD");
    git("checkout", "-q", "-b", "feat/x");
    commit("feat: on the branch");
    git("checkout", "-q", "main");
    commit("fix: on main");
    git("merge", "-q", "--no-ff", "-m", "Not conventional merge", "feat/x");
    expect(commitProblems(["--range", `${base}..HEAD`], repo)).toEqual([]);
  });

  it("does not skip a commit because its author claims to be dependabot", () => {
    const base = git("rev-parse", "HEAD");
    const spoofed = commit(
      "Bump the npm-minor-patch group across 1 directory with 7 updates (#11)",
      "dependabot[bot] <49699333+dependabot[bot]@users.noreply.github.com>",
    );
    expect(commitProblems(["--range", `${base}..HEAD`], repo).join("\n")).toContain(spoofed.slice(0, 7));
  });

  it("exempts git's revert and fixup commits but not look-alikes", () => {
    const base = git("rev-parse", "HEAD");
    commit('Revert "feat: thing"\n\nThis reverts commit abc.');
    commit("fixup! feat: thing");
    expect(commitProblems(["--range", `${base}..HEAD`], repo)).toEqual([]);
    const fake = commit("Revert the deploy");
    expect(commitProblems(["--range", `${base}..HEAD`], repo).join("\n")).toContain(fake.slice(0, 7));
  });

  it("checks the full first line, not git's space-joined subject", () => {
    const base = git("rev-parse", "HEAD");
    commit("feat: first line.\nsecond line of the paragraph");
    expect(commitProblems(["--range", `${base}..HEAD`], repo).join("\n")).toMatch(/period/);
  });

  it("passes on an empty range", () => {
    const head = git("rev-parse", "HEAD");
    expect(commitProblems(["--range", `${head}..${head}`], repo)).toEqual([]);
  });
});

describe("check-commit usage", () => {
  it("exits 2 without a mode", () => {
    const result = checkCommit();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("usage");
  });

  it("exits 2 on an unknown flag or a missing value", () => {
    expect(checkCommit("--nope").status).toBe(2);
    expect(checkCommit("--message").status).toBe(2);
    expect(checkCommit("--range").status).toBe(2);
  });
});
