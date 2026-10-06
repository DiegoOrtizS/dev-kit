import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const bash = (command: string) => evaluateToolCall({ tool_name: "Bash", tool_input: { command } });
const powershell = (command: string) => evaluateToolCall({ tool_name: "PowerShell", tool_input: { command } });

const encoded = (script: string) => Buffer.from(script, "utf16le").toString("base64");

describe("PowerShell tool", () => {
  it.each([
    "git push --force",
    "git push origin main",
    "git commit --no-verify -m x",
    "gh auth login",
    "$env:LEFTHOOK=0; git commit -m x",
    "$env:LEFTHOOK = '0'; git commit -m x",
    "git status; git push -f",
    "Get-Content .env",
    "gc .env.local",
    "Remove-Item -Recurse -Force ~",
  ])("blocks %s", (command) => {
    expect(powershell(command).block).toBe(true);
  });

  it.each(["git status", "pnpm check", "git push -u origin feat/x", "Get-Content package.json"])(
    "allows %s",
    (command) => {
      expect(powershell(command).block).toBe(false);
    },
  );
});

describe("shell escapes", () => {
  it.each([
    "git push -\\f origin x",
    "git push origin ma\\in",
    "gi\\t push -f",
    "git push \\--force",
    'git push origin "ma\\"in"; git push -\\f',
    "bash -c 'git push -\\f'",
    "bash -c 'gi\\t push origin main'",
    "git push origin \\\nmain",
    "pwsh -c 'gi`t push -f'",
    "cmd /c git push -f",
  ])("blocks in bash %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    'git push origin "ma\\in"',
    "git push origin 'ma\\in'",
    "git push origin feat/\\x",
    "echo \\; git push -u origin feat/x",
  ])("allows in bash %s", (command) => {
    expect(bash(command).block).toBe(false);
  });

  it.each([
    "git push -`f origin x",
    "git push origin ma`in",
    "gi`t push -f",
    'git push origin "ma`in"',
    "git push `--force",
    "pwsh -c 'git push -`f'",
  ])("blocks in powershell %s", (command) => {
    expect(powershell(command).block).toBe(true);
  });

  it.each(["git push origin feat\\x", "git push origin 'ma`in'", "Remove-Item -Recurse build\\out"])(
    "allows in powershell %s",
    (command) => {
      expect(powershell(command).block).toBe(false);
    },
  );
});

describe("cmd switches", () => {
  it.each(["cmd /c rd /s /q C:\\", "rd /s /q C:\\", "cmd /c rmdir /s /q ."])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each(["cmd /c rd /s /q build", "rd /s /q build\\out", "cmd /c del /f /q /s dist\\x.js"])(
    "allows %s",
    (command) => {
      expect(bash(command).block).toBe(false);
    },
  );
});

describe("shell forms", () => {
  it.each([
    "if true; then git push -f; fi",
    "if git status; then git push --force; else echo no; fi",
    "! git push -f",
    "{ git push -f; }",
    "while true; do git push -f; done",
    "until false; do git push origin main; done",
    "for b in a b; do git push origin main; done",
    "timeout 10 git push -f",
    "timeout -s KILL 10 git push -f",
    "nice -n 5 git push -f",
    "echo x | xargs -I {} git push -f",
    "xargs git push -f",
    "sudo -u root git push -f",
    "sudo -n git push -f",
    "sudo -g wheel -u bob git push -f",
    "env -u FOO git push -f",
    "env -i FOO=1 git push -f",
    "env -S 'git push -f'",
    "find . -exec git push -f \\;",
    "find . -name x -execdir git push origin main \\;",
    "find . -exec git push --force {} +",
    "bash -lc 'git push -f'",
    "bash -c -- 'git push -f'",
    "sh -ec 'git push -f'",
    "zsh -c 'git push origin main'",
    "bash -c 'eval \"git push -f\"'",
    "pwsh -c 'git push -f'",
    'pwsh -Command "git push -f"',
    'powershell.exe -NoProfile -Command "git push -f"',
    "cmd /c git push -f",
    'cmd.exe /d /c "git push --force"',
    'eval "git push -f"',
    "eval git push -f",
    `pwsh -EncodedCommand ${encoded("git push -f")}`,
    `powershell -enc ${encoded("git push origin main")}`,
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "bash -c 'echo hi'",
    "bash script.sh",
    "bash -x script.sh",
    "sudo -u root ls",
    "timeout 10 pnpm test",
    "nice -n 5 pnpm check",
    "find . -name '*.ts' -exec prettier --check {} \\;",
    'eval "echo hi"',
    "xargs echo",
    "if true; then echo ok; fi",
    "pwsh -c 'Get-Date'",
    "cmd /c dir",
    "env -u FOO pnpm check",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe("cmd invocation forms", () => {
  it.each([
    "cmd //c rd /s /q C:\\",
    'cmd //c "git push -f origin x"',
    "cmd /cgit push -f origin x",
    "cmd //cgit push -f origin x",
    'cmd /c "rd /s/q C:\\"',
    "cmd /c rd,/s,/q,C:\\",
    "cmd /c rd /s/q C:\\",
    "cmd /c git,push,-f,origin,x",
    'cmd /c "git;push;-f;origin;x"',
    "rd /s/q .",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each(["cmd //c dir", "cmd /c rd /s/q build", "cmd //c git status"])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe("command substitution inside double quotes", () => {
  it.each([
    'echo "$(git push -f origin x)"',
    'out="$(git push origin main 2>&1)"',
    'echo "`git push -f origin x`"',
    'echo "a $(echo "$(git push -f)")"',
    'echo "$(git push -f origin x)" | cat',
    "git commit -m \"$(cat <<'EOF'\ndon't\nEOF\n)\"; git push -f origin x",
    "bash <<EOF\ngit push -f origin x\nEOF",
  ])("blocks in bash %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    'echo "$(date)"',
    'echo "\\$(git push -f)"',
    "echo '$(git push -f)'",
    "git commit -m \"$(cat <<'EOF'\nfix: guard don't leak\n\nbody line\nEOF\n)\"",
    "cat <<EOF\ngit push -f origin x\nEOF",
  ])("allows in bash %s", (command) => {
    expect(bash(command).block).toBe(false);
  });

  it.each(['Write-Output "$(git push -f origin x)"', 'echo "$(git push origin main)"'])(
    "blocks in powershell %s",
    (command) => {
      expect(powershell(command).block).toBe(true);
    },
  );

  it("allows a benign powershell substitution", () => {
    expect(powershell('Write-Output "$(Get-Date)"').block).toBe(false);
  });
});

describe("bash ANSI-C and locale quoting", () => {
  it.each([
    "git push origin $'main'",
    "git push $'-f' origin x",
    "bash -c $'git push -f origin x'",
    "git push origin $'ma\\x69n'",
    "git push origin $'\\155ain'",
    "git push origin $'ma\\u0069n'",
    'git push origin $"main"',
    'git push $"--force" origin x',
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each(["git push origin $'feat/x'", "echo $'a\\nb'", "git push origin $'feat\\x2fx'"])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe("redirections", () => {
  it.each([
    "git push origin main>/dev/null",
    "git push -f>/dev/null origin x",
    "rm -rf ~>/dev/null",
    "git push origin main 2>&1",
    "git push &>/dev/null origin main",
    "git push origin>/dev/null main",
    "cat<.env",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "git push origin feat/x >main",
    "git push origin feat/x 2>&1",
    "git push -u origin feat/x >/dev/null 2>&1",
    "git push origin feat/x 2>main",
    "git push origin feat/x >>main",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});
