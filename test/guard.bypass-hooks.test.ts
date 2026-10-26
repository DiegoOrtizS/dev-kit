import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const bash = (command: string) => evaluateToolCall({ tool_name: "Bash", tool_input: { command } });
const powershell = (command: string) => evaluateToolCall({ tool_name: "PowerShell", tool_input: { command } });
const write = (tool: string, file_path: string) =>
  evaluateToolCall({ tool_name: tool, tool_input: { file_path, content: "x", new_string: "x" } });

describe("git hooks and config files", () => {
  it.each([
    "C:/Users/x/repos/kit/.git/hooks/pre-commit",
    "C:\\Users\\x\\repos\\kit\\.git\\hooks\\pre-push",
    "../kit/.git/hooks/pre-commit",
    ".git/hooks/commit-msg",
    ".git/config",
    "/home/x/kit/.git/config",
    "/home/x/kit/.git/worktrees/kit-fix/config.worktree",
    "../kit/.git/worktrees/kit-fix/config",
    ".git",
    "lefthook-local.yml",
    "packages/app/lefthook-local.yaml",
    "~/repos/kit/.git/hooks/pre-commit",
  ])("asks before writing %s", (path) => {
    for (const tool of ["Write", "Edit", "MultiEdit", "NotebookEdit"]) {
      const verdict = write(tool, path);
      expect(verdict.block).toBe(false);
      expect(verdict.ask).toBe(true);
      expect(verdict.reason).toMatch(/git hooks/);
    }
  });

  it.each([".github/workflows/ci.yml", "src/.gitignore", "lefthook.yml", "docs/git-hooks.md", ".gitconfig", "x.git"])(
    "allows writing %s",
    (path) => {
      expect(write("Write", path)).toEqual({ block: false });
    },
  );

  it.each([
    "cp hook.sh .git/hooks/pre-commit",
    "mv x ../kit/.git/config",
    "echo 'exit 0' > .git/hooks/pre-commit",
    "echo 'exit 0' >> .git/hooks/pre-push",
    "printf '' | tee .git/hooks/pre-commit",
    "chmod -x .git/hooks/pre-commit",
    "rm .git/hooks/pre-commit",
    "rm -rf .git/hooks",
    "truncate -s 0 .git/hooks/pre-commit",
    "echo x > lefthook-local.yml",
    "cp x .git",
  ])("asks before %s in bash", (command) => {
    expect(bash(command)).toMatchObject({ block: false, ask: true });
  });

  it.each(["Set-Content .git/hooks/pre-commit 'exit 0'", "sc .git\\hooks\\pre-commit x", "Out-File .git/config"])(
    "asks before %s in powershell",
    (command) => {
      expect(powershell(command)).toMatchObject({ block: false, ask: true });
    },
  );

  it.each([
    "cat .git/config",
    "ls .git/hooks",
    "git config --get core.hooksPath",
    "echo x > build/out.txt",
    "cp x lefthook.yml",
    "rm -rf .gitlab",
  ])("allows %s", (command) => {
    expect(bash(command)).toEqual({ block: false });
  });
});

describe("lefthook uninstall", () => {
  it.each(["lefthook uninstall", "lefthook uninstall -f", "pnpm lefthook uninstall", "npx -y lefthook uninstall"])(
    "blocks %s",
    (command) => {
      expect(bash(command).block).toBe(true);
    },
  );

  it.each(["lefthook install", "lefthook run pre-commit", "pnpm exec lefthook install", "pnpm lefthook"])(
    "allows %s",
    (command) => {
      expect(bash(command).block).toBe(false);
    },
  );
});

describe("hook-disabling environment outside bash syntax", () => {
  it.each([
    'cmd /c "set LEFTHOOK=0&& git commit -m x"',
    'cmd /c "set LEFTHOOK=0 && git commit -m x"',
    'cmd /c set "LEFTHOOK=0"',
    'cmd /c "set HUSKY=0&& git commit -m x"',
    'cmd /c "set LEFTHOOK_EXCLUDE=eslint& git commit -m x"',
    "HUSKY=0 git commit -m x",
    "export HUSKY=0",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "Set-Item Env:LEFTHOOK 0; git commit -m x",
    "Set-Item -Path Env:LEFTHOOK -Value 0",
    "si env:LEFTHOOK 0",
    "Set-Item Env:\\LEFTHOOK 0",
    "New-Item Env:LEFTHOOK -Value 0",
    "Set-Content Env:LEFTHOOK 0",
    "Set-Content -Path Env:LEFTHOOK_EXCLUDE -Value eslint",
    "[Environment]::SetEnvironmentVariable('LEFTHOOK', '0')",
    '[System.Environment]::SetEnvironmentVariable("LEFTHOOK_EXCLUDE", "eslint", "Process")',
    "$env:HUSKY=0; git commit -m x",
    "$env:GIT_CONFIG_COUNT = 1",
  ])("blocks %s in powershell", (command) => {
    expect(powershell(command).block).toBe(true);
  });

  it.each([
    'cmd /c "set FOO=1&& git status"',
    "cmd /c set",
    'cmd /c "set LEFTHOOK=1&& git commit -m x"',
    "cmd /c set LEFTHOOK",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });

  it.each([
    "Set-Item Env:FOO 1",
    "Set-Item Env:LEFTHOOK 1",
    "Set-Item -Path HKCU:\\x -Value 0",
    "[Environment]::SetEnvironmentVariable('FOO', '1')",
    "Get-Item Env:LEFTHOOK",
  ])("allows %s in powershell", (command) => {
    expect(powershell(command).block).toBe(false);
  });
});

describe("git aliases and includes", () => {
  it.each([
    "git -c alias.p='push --force' p origin main",
    "git -c alias.x='!git push -f' x",
    "git -calias.x=status x",
    "git --config-env=alias.x=X x",
    "git --config-env alias.x=X x",
    "git config alias.x '!git push -f'",
    "git config --global alias.p 'push --force'",
    "git config --add alias.x status",
    "git config set alias.x status",
    "git config --unset alias.x",
    "git -c include.path=/tmp/evil commit -m y",
    "git -c includeIf.gitdir:/.path=/tmp/evil status",
    "git config include.path /tmp/evil",
    "pnpm exec git -c alias.p='push -f' p",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "git config --get alias.x",
    "git config alias.x",
    "git config --get-regexp alias",
    "git config get alias.p",
    "git -c user.name=x commit -m y",
    "git -c core.autocrlf=false status",
    "git config pull.rebase false",
    "git p origin feat/x",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});
