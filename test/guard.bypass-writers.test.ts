import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config.mjs";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const unified = (path: string) => `--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-a\n+b\n`;
const settingsDiff = `diff --git a/.claude/settings.json b/.claude/settings.json\n${unified(".claude/settings.json")}`;
const patches: Record<string, string> = {
  "fix.diff": unified("src/x.ts"),
  "evil.patch": settingsDiff,
  "hook.patch": unified(".git/hooks/pre-commit"),
  "guard.patch": unified("tools/claude-hooks/guard.mjs"),
  "rename.patch":
    "diff --git a/docs/x.md b/tools/claude-hooks/guard.mjs\nsimilarity index 100%\nrename from docs/x.md\nrename to tools/claude-hooks/guard.mjs\n",
  "quoted.patch":
    'diff --git "a/.claude/guard.json" "b/.claude/guard.json"\n--- "a/.claude/guard.json"\n+++ "b/.claude/guard.json"\n',
  "mail.mbox": `From 0 Mon Sep 17 00:00:00 2001\nSubject: [PATCH] x\n\n---\n .claude/guard.json | 2 +-\n\n${unified(".claude/guard.json")}`,
  "plain.patch":
    "--- .claude/settings.json\t2026-01-01 00:00:00\n+++ .claude/settings.json\t2026-01-01 00:00:00\n@@ -1 +1 @@\n",
  "short.patch": unified("settings.json"),
  "state.patch": unified("state/STOP"),
  "dynamic.patch": "--- a/$TARGET\n+++ b/$TARGET\n",
};
const io = { readTextFile: (path: string) => patches[basename(path)] ?? null };
const bash = (command: string) => evaluateToolCall({ tool_name: "Bash", tool_input: { command } }, { io });
const withState = (command: string) =>
  evaluateToolCall(
    { tool_name: "Bash", tool_input: { command } },
    { io, config: normalizeConfig({ blockedPaths: { write: ["^state/"] } }) },
  );

describe("in-place editors and other writers", () => {
  it.each([
    "sed -i 's/x/y/' .git/hooks/pre-commit",
    "sed -ni 's/x/y/' .git/hooks/pre-commit",
    "sed -i.bak -e 's/x/y/' .git/config",
    "sed --in-place=.bak 's/x/y/' ~/.gitconfig",
    "perl -pi -e 's/x/y/' .git/hooks/pre-push",
    "perl -i.bak -pe 's/x/y/' .git/config",
    "awk -i inplace '{print}' .git/hooks/pre-commit",
    "gawk --inplace '{print}' .git/hooks/pre-commit",
    "ln -sf /dev/null .git/hooks/pre-commit",
    "ln hook .git/hooks/pre-commit",
    "install -m 755 hook.sh .git/hooks/pre-commit",
    "dd if=/dev/null of=.git/hooks/pre-commit",
    "patch .git/hooks/pre-commit < x.diff",
    "patch -p0 .git/config",
    "tee -a .git/hooks/pre-commit",
  ])("asks before %s", (command) => {
    expect(bash(command)).toMatchObject({ block: false, ask: true });
  });

  it.each([
    "sed -n 1p .git/config",
    "sed -i 's/a/b/' src/x.ts",
    "sed -e 's/a/b/' .git/hooks/pre-commit",
    "perl -ne 'print' .git/config",
    "awk '{print}' .git/config",
    "ln -s a b",
    "install -d build",
    "dd if=x of=y",
    "patch -p1 < fix.diff",
    "tee build/log.txt",
  ])("allows %s", (command) => {
    expect(bash(command)).toEqual({ block: false });
  });

  it("still blocks an in-place editor that reads a .env file", () => {
    expect(bash("sed -i 's/a/b/' .env").block).toBe(true);
  });
});

describe("patches applied to protected files", () => {
  it.each([
    "git apply evil.patch",
    "git apply --index -R evil.patch",
    "git apply hook.patch",
    "git apply rename.patch",
    "git apply quoted.patch",
    "git apply -p0 plain.patch",
    "git apply --directory=.claude short.patch",
    "git apply --directory .claude short.patch",
    "git am mail.mbox",
    "git am -3 mail.mbox",
    "git apply < evil.patch",
    "git apply - < evil.patch",
    "cat evil.patch | git apply",
    "cat evil.patch | git am",
    `git apply <<'EOF'\n${settingsDiff}EOF`,
    `cat <<'EOF' | git apply\n${settingsDiff}EOF`,
    "echo 'diff --git a/.claude/guard.json b/.claude/guard.json' | git apply",
    "patch -p1 < evil.patch",
    "patch -p1 -i evil.patch",
    "patch --strip=1 --input=evil.patch",
    "patch -p 1 --input evil.patch",
    "patch -p0 < plain.patch",
    "patch < guard.patch",
    "patch -d .claude -p1 < short.patch",
    "pnpm exec git apply evil.patch",
    "bash -c 'git apply evil.patch'",
    "git -C . apply evil.patch",
  ])("asks before %s", (command) => {
    expect(bash(command)).toMatchObject({ block: false, ask: true });
  });

  it.each([
    "git apply missing.patch",
    "git apply dynamic.patch",
    "curl -s https://example.com/x.patch | git apply",
    "git diff main | git apply -R",
    'git apply <<< "$(cat evil.patch)"',
    "git am --continue",
    "git am --skip",
    "patch -p1 < missing.patch",
  ])("asks before %s, whose targets cannot be read", (command) => {
    const verdict = bash(command);
    expect(verdict).toMatchObject({ block: false, ask: true });
    expect(verdict.reason).toMatch(/cannot read/);
  });

  it.each([
    "git apply fix.diff",
    "git apply --check evil.patch",
    "git apply --stat evil.patch",
    "git apply --numstat --summary evil.patch",
    "git apply plain.patch",
    "patch -p1 -i fix.diff",
    "cat fix.diff | git apply",
    "git apply",
    "git am --abort",
    "git am --show-current-patch",
  ])("allows %s", (command) => {
    expect(bash(command)).toEqual({ block: false });
  });

  it("denies a patch into a write-blocked folder", () => {
    expect(withState("git apply state.patch").block).toBe(true);
  });
});

describe("git checkout and restore of protected files", () => {
  it.each([
    "git checkout main -- .claude/settings.json",
    "git checkout main .claude/settings.json",
    "git checkout origin/x -- tools/claude-hooks/guard.mjs",
    "git checkout main -- .claude",
    "git checkout main -- tools",
    "git checkout main -- '*.json'",
    "git checkout main -- :/.claude/settings.json",
    "git checkout main -- lefthook-local.yml",
    "git restore --source main .claude/guard.json",
    "git restore -s main -- tools/claude-hooks",
    "git restore --source=main --staged --worktree .claude/settings.json",
    "git restore .claude/settings.json",
  ])("asks before %s", (command) => {
    expect(bash(command)).toMatchObject({ block: false, ask: true });
  });

  it.each(["git checkout --pathspec-from-file=list.txt main", "git restore --pathspec-from-file list.txt"])(
    "asks before %s, whose paths cannot be read",
    (command) => {
      expect(bash(command)).toMatchObject({ block: false, ask: true });
    },
  );

  it.each([
    "git checkout -- .",
    "git checkout .",
    "git restore .",
    "git restore -W .",
    "git checkout main -- .",
    "git checkout HEAD -- :/",
    "git restore --source=HEAD :/",
  ])("blocks %s, which rewrites the whole tree", (command) => {
    const verdict = bash(command);
    expect(verdict.block).toBe(true);
    expect(verdict.reason).toMatch(/discards work/);
  });

  it.each([
    "git checkout main",
    "git checkout -b feat/x",
    "git checkout -b tools origin/main",
    "git checkout main -- src/x.ts",
    "git checkout main -- '*.ts'",
    "git checkout -- src",
    "git restore src/x.ts",
    "git restore --staged .",
    "git restore --staged .claude/settings.json",
  ])("allows %s", (command) => {
    expect(bash(command)).toEqual({ block: false });
  });

  it("denies a checkout into a write-blocked folder", () => {
    expect(withState("git checkout main -- state/STOP").block).toBe(true);
  });
});

describe("inline interpreter code", () => {
  it.each([
    "node -e \"require('child_process').execSync('git push -f')\"",
    "node -e 'const { spawn } = require(\"child_process\")'",
    'node -e \'require("fs").rmSync("x", { recursive: true })\'',
    'node -p \'require("child_process").execSync("id")\'',
    "node --eval \"require('child_process')\"",
    "node --eval=\"require('child_process')\"",
    'python -c \'import subprocess; subprocess.run(["git", "push", "-f"])\'',
    "python3 -c 'import shutil; shutil.rmtree(\"x\")'",
    "python -c 'import os; os.remove(\"x\")'",
    "perl -e 'system(\"git push -f\")'",
    "perl -E 'system(\"git push -f\")'",
    "ruby -e 'system(\"git push -f\")'",
    "php -r 'system(\"git push -f\");'",
    "pnpm exec node -e \"require('child_process').execSync('x')\"",
  ])("asks before %s", (command) => {
    expect(bash(command)).toMatchObject({ block: false, ask: true });
  });

  it.each([
    'node -e "console.log(1)"',
    "python -c 'print(1)'",
    "node script.js",
    "perl -e 'print 1'",
    'node -e \'require("fs").readFileSync("x")\'',
    "python -m pytest",
    "node --version",
  ])("allows %s", (command) => {
    expect(bash(command)).toEqual({ block: false });
  });
});
