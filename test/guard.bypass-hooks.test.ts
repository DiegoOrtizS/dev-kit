import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const bash = (command: string) => evaluateToolCall({ tool_name: "Bash", tool_input: { command } });

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
