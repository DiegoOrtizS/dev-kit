import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const bash = (command: string) => evaluateToolCall({ tool_name: "Bash", tool_input: { command } });

describe("evaluateToolCall", () => {
  it.each([
    "git push --force origin feat/x",
    "git push -f",
    "git push origin main",
    "git push origin HEAD:main",
    "git -C . push origin main",
    "echo ok && git push --force-with-lease",
    "git commit --no-verify -m x",
    "git push --no-verify",
    "gh auth login",
    "gh auth refresh -s repo",
    "gh repo delete owner/repo",
    "cat .env",
    "rm -rf /",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "git push -u origin feat/plan-1-foundation",
    "git push",
    "gh pr create --draft",
    "pnpm check",
    "git commit -m 'feat: x'",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });

  it.each([
    "FOO=1 git push -f",
    "FOO=1 BAR=2 git push origin main",
    "git -C /tmp/repo -c user.name=x push --force",
    "git --no-pager push -fu origin feat/x",
    "git push origin +feat/x",
    "git push origin +HEAD:feat/x",
    "git push origin feat/x:main",
    "git push origin feat/x:refs/heads/main",
    "git push origin refs/heads/main",
    "git push --delete origin main",
    "git push origin :main",
    "git commit -n -m x",
    "git commit -anm x",
    "git -c core.hooksPath=/dev/null commit -m x",
    "LEFTHOOK=0 git commit -m x",
    "git status; git push --force",
    "git status || git push -f",
    "git log | cat; git push origin main",
    "true & git push -f",
    "git status\ngit push -f",
    "(git push -f)",
    "echo $(git push -f)",
    "bash -c 'git push --force'",
    'sh -c "git commit --no-verify -m x"',
    "sudo git push -f",
    "env GIT_TRACE=1 git push -f",
    "git 'push' '--force'",
    'git push "origin" "main"',
    "gh -R owner/repo repo delete",
    "gh repo delete",
    "cat .env.local",
    "cat ./config/.env.production",
    "less .env",
    "head -n 3 .env",
    "tail -f .env.local",
    "type .env",
    "rm -rf ~",
    "rm -rf ..",
    "rm -rf ~/",
    "rm -fr /",
    "rm -r /",
    "rm --recursive --force /",
    "rm -rf /*",
    "rm -rf $HOME",
    "cd repo && rm -rf ..",
  ])("blocks compound or variant %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "git log --format=%H",
    "git log --oneline -n 5",
    "git log --grep=--force",
    "grep -- --force README.md",
    "grep -rn 'git push --force' docs",
    "echo 'git push --force'",
    'echo "git push origin main"',
    "git push origin feat/main-page",
    "git push origin main-fix",
    "git push origin feat/x:feat/x",
    "git push -u origin chore/x",
    "git push --dry-run",
    "git commit -m 'fix: do not use --no-verify'",
    'git commit -m "docs: git push -f is blocked"',
    "git commit -m 'docs: explain rm -rf /'",
    "git commit -am 'feat: x'",
    "git fetch origin main",
    "git pull origin main",
    "git checkout main",
    "git merge main",
    "git diff main",
    "git branch -f feat/x main",
    "git status && git diff",
    "FOO=1 pnpm check",
    "LEFTHOOK=1 git commit -m x",
    "gh auth status",
    "gh repo view",
    "gh pr view 1",
    "cat .env.example",
    "cat src/env.ts",
    "cat environment.md",
    "ls -la .env",
    "grep dotenv package.json",
    "rm -rf node_modules",
    "rm -rf ./dist",
    "rm -rf .next",
    "rm file.txt",
    "rm -f ../x.txt",
    "ls ..",
    "cd .. && pnpm check",
    "",
  ])("allows legitimate %s", (command) => {
    expect(bash(command).block).toBe(false);
  });

  it("provides a reason when blocking", () => {
    const verdict = bash("git push --force");
    expect(verdict.reason).toMatch(/force/i);
  });

  it("does not block when the command input is missing", () => {
    expect(evaluateToolCall({ tool_name: "Bash", tool_input: {} }).block).toBe(false);
  });

  it("ignores unrelated tools", () => {
    expect(evaluateToolCall({ tool_name: "Read", tool_input: { file_path: ".env" } }).block).toBe(false);
  });

  it("blocks writing a secret", () => {
    const content = ['const t = "', "github", "_pat_", "11ABCDEFG0abcdefghijklmnopqrstuvwxyz0123", '";'].join("");
    expect(evaluateToolCall({ tool_name: "Write", tool_input: { file_path: "src/x.ts", content } }).block).toBe(true);
  });

  it("blocks an edit introducing a secret", () => {
    const new_string = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");
    expect(
      evaluateToolCall({ tool_name: "Edit", tool_input: { file_path: "src/x.ts", old_string: "a", new_string } }).block,
    ).toBe(true);
  });

  it("blocks a multi-edit introducing a secret", () => {
    const secret = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");
    const edits = [
      { old_string: "a", new_string: "b" },
      { old_string: "c", new_string: `key = ${secret}` },
    ];
    expect(evaluateToolCall({ tool_name: "MultiEdit", tool_input: { file_path: "src/x.ts", edits } }).block).toBe(true);
  });

  it("allows clean writes and edits", () => {
    expect(
      evaluateToolCall({ tool_name: "Write", tool_input: { file_path: "src/x.ts", content: "export const a = 1;" } })
        .block,
    ).toBe(false);
    expect(
      evaluateToolCall({
        tool_name: "MultiEdit",
        tool_input: { file_path: "src/x.ts", edits: [{ old_string: "a", new_string: "b" }] },
      }).block,
    ).toBe(false);
  });

  it("does not crash on malformed edit payloads", () => {
    expect(evaluateToolCall({ tool_name: "MultiEdit", tool_input: { edits: "nope" } }).block).toBe(false);
    expect(evaluateToolCall({ tool_name: "Write", tool_input: { content: 42 } }).block).toBe(false);
  });
});
