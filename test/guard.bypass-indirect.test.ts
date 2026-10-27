import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const bash = (command: string) => evaluateToolCall({ tool_name: "Bash", tool_input: { command } });
const powershell = (command: string) => evaluateToolCall({ tool_name: "PowerShell", tool_input: { command } });

describe("moving, unlinking and linking protected files", () => {
  it.each([
    "mv .git/hooks/pre-commit /tmp/x",
    "mv .claude/settings.json /tmp/x",
    "mv .claude .claude-old",
    "mv tools/claude-hooks /tmp/x",
    "mv tools /tmp/x",
    "rm -r .claude",
    "rm -rf tools",
    "unlink .claude/settings.json",
    "unlink .git/hooks/pre-commit",
    "shred -u .git/hooks/pre-push",
    "ln -s .claude/settings.json x",
    "ln .git/hooks/pre-commit hook",
    "cp settings.json .claude/",
    "mv guard.json .claude",
    "cp -r evil/.claude .",
    "cp -r claude-hooks tools",
    "rsync -a x .claude/settings.json",
    "git rm .claude/settings.json",
    "git rm -r .claude",
    "git rm -r .",
    "git mv .claude/settings.json x",
    "git mv x .claude/settings.json",
  ])("asks before %s", (command) => {
    expect(bash(command)).toMatchObject({ block: false, ask: true });
  });

  it.each([
    "Move-Item .claude\\settings.json C:\\tmp\\x",
    "Remove-Item -Recurse .claude",
    "mi .git\\hooks\\pre-commit x",
  ])("asks before %s in powershell", (command) => {
    expect(powershell(command)).toMatchObject({ block: false, ask: true });
  });

  it.each([
    "mv src/a.ts src/b.ts",
    "mv README.md docs/",
    "rm -rf .claude/agents/old",
    "cp README.md tools/",
    "cp x tools/x.sh",
    "ln -s ../shared/config.json config.json",
    "rsync -a dist/ /tmp/dist/",
    "git rm --cached .claude/settings.json",
    "git rm src/old.ts",
    "git mv src/a.ts src/b.ts",
  ])("allows %s", (command) => {
    expect(bash(command)).toEqual({ block: false });
  });
});

describe("inline code that writes protected files", () => {
  it.each([
    "node -e \"require('fs').writeFileSync('.claude/settings.json', '{}')\"",
    "node -e \"require('fs').renameSync('tools/claude-hooks/guard.mjs', 'x')\"",
    "python -c \"open('.git/hooks/pre-commit', 'w').write('')\"",
    "python3 -c \"import pathlib; pathlib.Path('.claude/guard.json').write_text('{}')\"",
  ])("asks before %s", (command) => {
    expect(bash(command)).toMatchObject({ block: false, ask: true });
  });

  it.each([
    "[IO.File]::WriteAllText('.claude/settings.json', '{}')",
    "[System.IO.File]::Copy('x', '.git\\hooks\\pre-commit', $true)",
    "[System.IO.Directory]::Delete('..', 1)",
    "[IO.File]::Delete('x')",
    "[IO.Directory]::Move('.claude', 'x')",
  ])("asks before %s in powershell", (command) => {
    expect(powershell(command)).toMatchObject({ block: false, ask: true });
  });

  it("still blocks a .NET delete whose argument is a variable", () => {
    expect(powershell("[System.IO.Directory]::Delete($HOME, $true)").block).toBe(true);
  });

  it.each([
    "node -e \"console.log(require('./.claude/settings.json'))\"",
    "node -e \"require('fs').writeFileSync('out.txt', 'x')\"",
  ])("allows %s", (command) => {
    expect(bash(command)).toEqual({ block: false });
  });

  it.each([
    "[IO.File]::WriteAllText('out.txt', 'x')",
    "[IO.File]::ReadAllText('.claude/settings.json')",
    "[IO.Path]::Combine('a', 'b')",
  ])("allows %s in powershell", (command) => {
    expect(powershell(command)).toEqual({ block: false });
  });
});
