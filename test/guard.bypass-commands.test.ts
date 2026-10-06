import { homedir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const bash = (command: string) => evaluateToolCall({ tool_name: "Bash", tool_input: { command } });
const powershell = (command: string) => evaluateToolCall({ tool_name: "PowerShell", tool_input: { command } });

const repoRoot = fileURLToPath(new URL("..", import.meta.url))
  .replace(/\\/g, "/")
  .replace(/\/$/, "");
const home = homedir().replace(/\\/g, "/");

describe("git config reads", () => {
  it.each([
    "git config --get-all core.hooksPath",
    "git config --get-regexp hooks",
    "git config get core.hooksPath",
    "git config list",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });

  it.each(["git config set core.hooksPath x", "git config --add core.hooksPath x"])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });
});

describe("hook-disabling", () => {
  it.each([
    "git config core.hooksPath /dev/null",
    "git config --global core.hooksPath x",
    "git config --local core.hookspath x",
    "git config --system core.hooksPath x",
    "git config --unset core.hooksPath",
    "git -c core.hooksPath=x commit -m y",
    "git -ccore.hooksPath=x commit -m y",
    "git --config-env=core.hooksPath=HOOKS commit -m y",
    "git --config-env core.hooksPath=HOOKS commit -m y",
    "GIT_CONFIG_PARAMETERS=\"'core.hooksPath=x'\" git commit -m y",
    "GIT_CONFIG_COUNT=1 git commit -m y",
    "GIT_CONFIG_KEY_0=core.hooksPath git commit -m y",
    "GIT_CONFIG_VALUE_0=x git commit -m y",
    "export GIT_CONFIG_COUNT=1",
    "export GIT_CONFIG_PARAMETERS=x",
    "LEFTHOOK=0 git commit -m y",
    "LEFTHOOK=false git commit -m y",
    "LEFTHOOK_EXCLUDE=eslint git commit -m y",
    "export LEFTHOOK=0",
    "export LEFTHOOK_EXCLUDE=eslint",
    "env LEFTHOOK=0 git commit -m y",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "git config user.name x",
    "git config --get core.hooksPath",
    "LEFTHOOK=1 git commit -m y",
    "LEFTHOOK_VERBOSE=1 git commit -m y",
    "export FOO=1",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe("git push variants", () => {
  it.each([
    "git push --mirror",
    "git push --all",
    "git push --mirr",
    "git push --al origin",
    "git push --no-verif",
    "git push --force-w",
    "git push --force-with-lease=main:abc origin feat/x",
    "git push --force-if",
    "git push --forc",
    "git commit --no-verif -m x",
    "git push --repo=origin main",
    "git push --repo origin main",
    "git push --rep=origin HEAD:main",
    "git push -o ci.skip origin main",
    "git push --delete origin main",
    "git push --del origin main",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "git push --repo=origin feat/x",
    "git push --repo origin feat/x",
    "git push -o ci.skip origin feat/x",
    "git push --delete origin feat/old",
    "git push --tags",
    "git push --atomic origin feat/x",
    "git commit --amend -m x",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe("gh gaps", () => {
  it.each([
    "gh auth token",
    "gh auth status -t",
    "gh auth status --show-token",
    "gh api -X DELETE repos/owner/repo",
    "gh api --method=PATCH repos/o/r",
    "gh api -XPUT repos/o/r/branches/main/protection",
    "gh api -X POST repos/o/r/git/refs -f ref=x",
    "gh api repos/o/r -f archived=true",
    "gh api repos/o/r -F archived=true",
    "gh api repos/o/r/git/refs/heads/main -X DELETE",
    "gh api -X PATCH /repos/o/r/",
    "gh api -X DELETE 'repos/{owner}/{repo}'",
    "gh api -X PUT https://api.github.com/repos/o/r/branches/main/protection",
    "gh api --input body.json repos/o/r/branches/main/protection",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "gh auth status",
    "gh api repos/o/r",
    "gh api -X GET repos/o/r -f x=1",
    "gh api repos/o/r/pulls -f title=x",
    "gh api -X POST repos/o/r/issues -f title=x",
    "gh api user",
    "gh api repos/o/r/git/refs",
    "gh api -H 'Accept: application/json' repos/o/r/branches/main/protection",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe(".env access", () => {
  it.each([
    "grep SECRET .env",
    "grep -r SECRET .env.local",
    "sed -n 1p .env",
    "awk '{print}' .env.production",
    "nl .env",
    "bat .env",
    "base64 .env",
    "xxd .env",
    "source .env",
    ". ./.env",
    "cp .env /tmp/x",
    "mv .env.local /tmp/x",
    "cat .env.test.local",
    "cat < .env",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    "cat .env.example",
    "cat .env.local.example",
    "cat .env.test",
    "grep X .env.example",
    "cp .env.example .env",
    "grep dotenv package.json",
    ". ./scripts/setup.sh",
    "source venv/bin/activate",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe("destructive filesystem and git", () => {
  it.each([
    "rm -rf .",
    "rm -rf ..",
    "rm -rf ../..",
    "rm -rf *",
    "rm -rf ./*",
    "rm -rf /c",
    "rm -rf C:/",
    "rm -rf C:\\",
    "rm -rf ~",
    "rm -rf ~/.ssh",
    "rm -rf $HOME/.ssh",
    "rm -rf ${HOME}",
    `rm -rf ${home}`,
    `rm -rf ${repoRoot}`,
    `rm -rf ${repoRoot}/`,
    `rm -rf ${repoRoot}/*`,
    `rm -rf ${dirname(repoRoot)}`,
    `rm -rf ${repoRoot}/.git`,
    "git reset --hard",
    "git reset --hard HEAD~1",
    "git reset --ha",
    "git clean -f",
    "git clean -fd",
    "git clean -xfd",
    "git clean --force",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([
    `rm -rf ${repoRoot}/node_modules`,
    `rm -rf ${repoRoot}/.next`,
    "rm -rf node_modules",
    "rm -rf dist/*",
    "rm -rf /tmp/build-cache",
    "git reset --soft HEAD~1",
    "git reset HEAD file.ts",
    "git clean -n",
    "git clean --dry-run",
    "git clean -nd",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });

  it("explains that the working tree is shared", () => {
    expect(bash("git reset --hard").reason).toMatch(/ask the repo owner/);
    expect(bash("git clean -fd").reason).toMatch(/ask the repo owner/);
  });
});

describe("git config reads and writes", () => {
  it.each(["git config --comment --get core.hooksPath /dev/null", "git config --file x.cfg core.hooksPath /dev/null"])(
    "blocks %s",
    (command) => {
      expect(bash(command).block).toBe(true);
    },
  );

  it.each([
    "git config core.hooksPath",
    "git config --file x.cfg core.hooksPath",
    "git config --global core.hooksPath",
  ])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe("cheap round 3 gaps", () => {
  it.each(["&{git push -f origin x}", "& { git push -f origin x }", "pwsh -cwa 'git push -f origin x'"])(
    "blocks in powershell %s",
    (command) => {
      expect(powershell(command).block).toBe(true);
    },
  );

  it.each([
    "pwsh -cwa 'git push -f origin x'",
    "pwsh -CommandWithArgs 'git push -f origin x'",
    "pwsh -commandwith 'git push -f origin x'",
    "git push origin heads/main",
    "git push origin HEAD:heads/main",
    "git -c remote.origin.push=HEAD:main push",
    "git -cremote.origin.push=x push",
    "git --config-env remote.origin.push=X push",
  ])("blocks in bash %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each(["git push origin heads/feat", "git -c user.name=x commit -m y", "pwsh -cwa 'Get-Date'"])(
    "allows %s",
    (command) => {
      expect(bash(command).block).toBe(false);
    },
  );
});
