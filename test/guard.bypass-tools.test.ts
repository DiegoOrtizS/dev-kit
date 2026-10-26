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
