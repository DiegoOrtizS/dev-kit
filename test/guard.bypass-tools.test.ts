import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const bash = (command: string) => evaluateToolCall({ tool_name: "Bash", tool_input: { command } });
const monitor = (command: string) => evaluateToolCall({ tool_name: "Monitor", tool_input: { command } });
const powershell = (command: string) => evaluateToolCall({ tool_name: "PowerShell", tool_input: { command } });
const token = ["ghp_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0"].join("");

describe("Monitor tool", () => {
  it.each([
    "git push -f origin main",
    "while true; do git push origin main; sleep 30; done",
    "tail -f x.log | grep --line-buffered ERROR; git push --force",
  ])("blocks %s", (command) => {
    expect(monitor(command).block).toBe(true);
  });

  it.each(["tail -f dev.log | grep --line-buffered ERROR", "while true; do gh pr checks 1; sleep 30; done"])(
    "allows %s",
    (command) => {
      expect(monitor(command).block).toBe(false);
    },
  );

  it("ignores a websocket monitor without a command", () => {
    expect(evaluateToolCall({ tool_name: "Monitor", tool_input: { ws: { url: "wss://x" } } }).block).toBe(false);
  });
});

describe("NotebookEdit sources", () => {
  it("blocks a secret written into a notebook cell", () => {
    const verdict = evaluateToolCall({
      tool_name: "NotebookEdit",
      tool_input: { notebook_path: "x.ipynb", new_source: `TOKEN = "${token}"` },
    });
    expect(verdict.block).toBe(true);
    expect(verdict.reason).toMatch(/github-token/);
  });

  it("allows an ordinary cell", () => {
    const verdict = evaluateToolCall({
      tool_name: "NotebookEdit",
      tool_input: { notebook_path: "x.ipynb", new_source: "import pandas as pd" },
    });
    expect(verdict.block).toBe(false);
  });
});

describe("unknown wrappers", () => {
  it.each([
    "pnpm exec git push -f",
    "npx git push -f origin x",
    "winpty git push -f",
    "stdbuf -o0 git push --force",
    "pnpm dlx foo rm -rf ~",
    "docker run img git push origin main",
    "winpty pwsh -c 'git push -f'",
    "npx cross-env FOO=1 git push -f",
    "pnpm exec git.exe push -f",
    "yarn remove-item -recurse -force ~",
    "pnpm exec sst deploy --stage production",
    "npx sst@latest deploy --stage production",
    "npx sst@3.1.0 remove --stage=production",
    "pnpm exec GIT push -f",
    "npx Git.exe push --force",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "Start-Process git -ArgumentList 'push -f'",
    "Start-Process -FilePath git -ArgumentList 'push','-f'",
    "saps git 'push -f'",
    "Start-Process git -Args 'push','--force' -Wait",
    "Start-Process pwsh -ArgumentList '-c','git push -f'",
    "Start-Process -Wait -FilePath cmd -ArgumentList '/c','rd /s /q C:\\'",
    "Start-Process -Verb RunAs git -ArgumentList 'push -f'",
  ])("blocks %s in powershell", (command) => {
    expect(powershell(command).block).toBe(true);
  });

  it.each(["Start-Process notepad", "Start-Process git -ArgumentList 'status'", "Start-Process code ."])(
    "allows %s in powershell",
    (command) => {
      expect(powershell(command).block).toBe(false);
    },
  );

  it.each([
    "pnpm exec dev-kit sync-check",
    "pnpm exec eslint . --max-warnings=0",
    "pnpm exec vitest run test/guard.test.ts",
    "echo git push -f",
    "printf 'git push -f\\n'",
    "grep -r 'rm -rf' src",
    "grep git push src/x.mjs",
    "which git",
    "man git push",
    "pnpm exec git status",
    "npx prettier --check .",
    "git commit -m 'rm -rf cleanup'",
    "gh pr create --title 'git push -f'",
    "pnpm check",
    "npx sst@latest dev",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe("shell aliases defined in the command", () => {
  it.each([
    "alias x='git push -f'",
    "alias g=git",
    "alias nuke='rm -rf ~'",
    "alias ll='ls -la' x='git reset --hard'",
    "alias x='echo hi; bash -c id'",
    "alias peek='cat .env'",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each(["Set-Alias x git", "New-Alias -Name x -Value Remove-Item", "sal g git.exe", "Set-Alias -Name rr -Value rm"])(
    "blocks %s in powershell",
    (command) => {
      expect(powershell(command).block).toBe(true);
    },
  );

  it.each(["alias", "alias ll", "alias ll='ls -la'", "unalias x", "f() { echo hi; }; f"])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });

  it.each(["Get-Alias", "Set-Alias np notepad"])("allows %s in powershell", (command) => {
    expect(powershell(command).block).toBe(false);
  });

  it("still checks a function body defined in the command", () => {
    expect(bash("f() { git push -f; }; f").block).toBe(true);
  });
});

describe("git config that runs a command", () => {
  it.each([
    "git -c core.pager='rm -rf ~' log",
    "git -c core.editor='git push -f' commit",
    "git -c core.sshCommand='rm -rf ~' fetch",
    "git -c credential.helper='!rm -rf ~' fetch",
    "git -c diff.x.textconv='rm -rf ~' diff",
    "git -c filter.x.smudge='rm -rf ~' checkout main",
    "git -c core.pager='$EVIL' log",
    "git --config-env=core.pager=PAGER_CMD log",
    "git config core.pager 'rm -rf ~'",
    "git config --global core.editor 'git push -f'",
    "git config set sequence.editor 'rm -rf ~'",
    "GIT_EDITOR='rm -rf ~' git commit",
    "GIT_SSH_COMMAND='rm -rf ~' git fetch",
    "PAGER='rm -rf ~' git log",
    "export GIT_PAGER='git push -f'",
    'GIT_EDITOR="$EVIL" git commit',
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it("blocks a PowerShell editor variable that runs a forbidden command", () => {
    expect(powershell("$env:GIT_EDITOR = 'rm -rf ~'; git commit").block).toBe(true);
  });

  it.each([
    "git -c core.pager=cat log",
    "git -c core.pager='less -R' log",
    "git -c core.editor=true rebase --continue",
    "GIT_EDITOR=true git rebase --continue",
    "git -c credential.helper=manager fetch",
    "git config core.editor 'code --wait'",
    "git config --get core.pager",
    "git config --unset core.pager",
    "EDITOR=vim git commit",
    "GIT_PAGER='less -R' git log",
  ])("allows %s", (command) => {
    expect(bash(command)).toEqual({ block: false });
  });
});
