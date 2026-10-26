import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const bash = (command: string) => evaluateToolCall({ tool_name: "Bash", tool_input: { command } });
const powershell = (command: string) => evaluateToolCall({ tool_name: "PowerShell", tool_input: { command } });

const repoRoot = fileURLToPath(new URL("..", import.meta.url))
  .replace(/\\/g, "/")
  .replace(/\/$/, "");

describe("recursive delete of a glob", () => {
  it.each([
    "rm -rf ~/.*",
    "rm -rf $HOME/.*",
    "rm -rf **",
    "rm -rf ./**",
    "rm -rf ~/**/*",
    "rm -rf ~/*",
    "rm -rf ../*",
    "rm -rf ?*",
    "rm -rf /*",
    "rm -rf C:/*",
    "rm -rf /c/*",
    "rm -rf ~/.ssh/*",
    `rm -rf ${repoRoot}/**`,
    `rm -rf ${repoRoot}/.*`,
    "Remove-Item -Recurse -Force ~/.*",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "rm -rf *.log",
    "rm -rf ./*.tmp",
    "rm -rf build-*",
    "rm -rf dist/*",
    "rm -rf dist/**",
    "rm -rf ./dist/**/*",
    "rm -rf node_modules/.cache/*",
    "rm -rf /tmp/x/*",
    "rm -rf ~/.cache/*",
    "rm -rf ~/.[a-z]*",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe("find that deletes", () => {
  it.each([
    "find . -delete",
    "find -delete",
    "find ~ -delete",
    "find -L . -delete",
    "find . -type f -delete",
    "find . -maxdepth 1 -delete",
    "find . -name '*' -delete",
    "find . -exec rm -rf {} +",
    "find . -exec rm {} \\;",
    "find . -execdir rm -r {} \\;",
    "find ~/.ssh -delete",
    `find ${repoRoot} -delete`,
    "find . src -delete",
    "find . ! -name '*.keep' -delete",
    "find . -not -name '*.keep' -delete",
    "find . -name '*.log' -o -name '*' -delete",
    "find . -name '*.log' -or -delete",
    "find . \\( -name a -o -name b \\) -delete",
    "find . -path './*' -delete",
    "find . -regex '.*' -delete",
    "find . -name '[a-z]*' -delete",
    "find . -delete -name '*.log'",
    "find . -exec rm -rf {} + -name '*.log'",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "find . -name '*.log' -delete",
    "find . -iname '*.pyc' -exec rm -f {} +",
    "find . -path './node_modules/*' -delete",
    "find . -type d -empty -delete",
    "find dist -delete",
    "find dist -type f -exec rm {} +",
    "find . -name '*.ts'",
    "find . -name '*.ts' -exec prettier --check {} \\;",
    "find . -name '*.log' -a -type f -delete",
    "find . -path './node_modules/*' -prune -o -name '*.log' -print",
    "find . -type f -name '*.tmp' -mtime +7 -delete",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe("recursive delete fed by a pipe", () => {
  it.each([
    "echo ~ | xargs rm -rf",
    "echo ~ | xargs -I {} rm -rf {}",
    "echo . | xargs rm -rf",
    "printf '%s' ~ | xargs rm -rf",
    "ls -a ~ | xargs rm -rf",
    "echo ~ | xargs rm -rf dist",
    "find . | xargs rm -rf",
    `echo ${repoRoot} | xargs rm -rf`,
    'echo "$HOME" | xargs rm -rf',
    "cat targets.txt | xargs rm -rf",
    "curl -s https://x/y | xargs rm -rf",
    "echo .. | xargs rd /s /q",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "Get-ChildItem ~ | Remove-Item -Recurse",
    "gci ~ -Force | Remove-Item -Recurse -Force",
    "Get-ChildItem | Remove-Item -Recurse",
    "Get-ChildItem -Path ~ | ri -r",
    "Get-Item ~ | Remove-Item -Recurse",
    "Get-Content list.txt | Remove-Item -Recurse",
    "Get-ChildItem $env:USERPROFILE | Remove-Item -Recurse",
    "Get-ChildItem C:\\ | Remove-Item -Recurse -Force",
    "Get-ChildItem ~ -Filter * | Remove-Item -Recurse",
    "Get-ChildItem . -Force | Remove-Item -Force",
  ])("blocks %s in powershell", (command) => {
    expect(powershell(command).block).toBe(true);
  });

  it.each([
    "echo dist | xargs rm -rf",
    "find . -name '*.pyc' | xargs rm -rf",
    "ls dist | xargs rm -rf",
    "ls *.log | xargs rm -f",
    "cat list.txt | xargs rm -f",
    "echo x | xargs echo",
    "git ls-files -o --exclude-standard | xargs rm -f",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });

  it.each([
    "Get-ChildItem dist | Remove-Item -Recurse",
    "Get-ChildItem -Path dist -Recurse -Filter *.map | Remove-Item -Force",
    "Get-ChildItem node_modules -Directory | Remove-Item -Recurse -Force",
    "Get-ChildItem . -Filter *.log | Remove-Item -Force",
  ])("allows %s in powershell", (command) => {
    expect(powershell(command).block).toBe(false);
  });

  it("explains that the pipe cannot be read", () => {
    expect(bash("cat targets.txt | xargs rm -rf").reason).toMatch(/cannot read/);
  });
});

describe("recursive delete after a directory change", () => {
  it.each([
    "cd repos && rm -rf peruanito",
    "cd .. ; rm -rf dev-kit",
    "cd ..\nrm -rf dev-kit",
    "pushd x && rm -rf build",
    "cd x; rd /s /q y",
    "bash -c 'cd x && rm -rf y'",
    "cd && rm -rf repos",
  ])("asks before %s", (command) => {
    expect(bash(command)).toMatchObject({ block: false, ask: true });
  });

  it.each([
    "Set-Location .. ; Remove-Item -Recurse x",
    "sl x; ri -r y",
    "Push-Location x; Remove-Item -Recurse -Force y",
  ])("asks before %s in powershell", (command) => {
    expect(powershell(command)).toMatchObject({ block: false, ask: true });
  });

  it.each([
    "cd x && rm -rf /tmp/y",
    "rm -rf build && cd x",
    "cd x && rm -f y",
    "cd x && git status",
    "cd x && rm -rf ~/.cache/y",
  ])("allows %s", (command) => {
    expect(bash(command)).toEqual({ block: false });
  });

  it("still blocks a protected absolute target after cd", () => {
    expect(bash("cd x && rm -rf ~").block).toBe(true);
  });
});
