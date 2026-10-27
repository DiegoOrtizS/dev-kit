import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";
import { regressionCases } from "./guard.regression.fixture.js";

const repoRoot = "C:/Users/Diego/repos/tcg-store";
const io = { gitAlias: () => null, readTextFile: () => null };
const decide = (tool: string, command: string) => {
  const input = ["Bash", "PowerShell", "Monitor"].includes(tool) ? { command } : { file_path: command };
  const verdict = evaluateToolCall({ tool_name: tool, tool_input: input, cwd: repoRoot }, { repoRoot, io });
  return verdict.block ? "DENY" : verdict.ask ? "ask" : "allow";
};

const intentionallyRelaxed = new Set(['Bash\u0000rm -rf "$(git rev-parse --show-toplevel)/dist"']);

describe("no case that was blocked or asked at f33b117 becomes allowed", () => {
  it.each(regressionCases)("%s %j stays at least as strict as %s", (tool, command, atF33b117) => {
    const now = decide(tool, command);
    expect(now).not.toMatch(/THROW/);
    if ((atF33b117 === "DENY" || atF33b117 === "ask") && !intentionallyRelaxed.has(`${tool}\u0000${command}`)) {
      expect(now, `${tool} ${command} was ${atF33b117} at f33b117`).not.toBe("allow");
    }
  });

  it("the one relaxed case is the documented show-toplevel resolution", () => {
    expect(decide("Bash", 'rm -rf "$(git rev-parse --show-toplevel)/dist"')).toBe("allow");
    expect(decide("Bash", 'rm -rf "$(git rev-parse --show-toplevel)"')).toBe("DENY");
  });
});

describe("everyday commands stay allowed", () => {
  it.each([
    ["Bash", "pnpm install --frozen-lockfile"],
    ["Bash", "pnpm check"],
    ["Bash", "git status"],
    ["Bash", "git log --oneline -5"],
    ["Bash", "git diff --stat"],
    ["Bash", "git commit -m 'fix: x'"],
    ["Bash", "git push -u origin feat/x"],
    ["Bash", "git fetch origin"],
    ["Bash", "git worktree add ../tcg-store-x -b feat/x origin/main"],
    ["Bash", "git worktree remove ../tcg-store-x"],
    ["Bash", "git worktree list"],
    ["Bash", "git branch -D feat/old"],
    ["Bash", "git checkout -- src/x.ts"],
    ["Bash", "git restore --staged x"],
    ["Bash", "cp a.txt dist/"],
    ["Bash", 'node -e "console.log(1)"'],
    ["Bash", 'python -c "print(1)"'],
    ["Bash", "rm -rf dist coverage"],
    ["Bash", "cd ../repo-wt && pnpm install"],
    ["Bash", "cd ../repo && git status"],
    ["Bash", "git lfs pull"],
    ["Bash", "git lfs pull && cd .."],
    ["Bash", "cp -t dist a.txt b.txt"],
    ["PowerShell", "Remove-Item -Recurse -Force dist, coverage"],
    ["PowerShell", "Remove-Item -Recurse -Force dist,coverage"],
    ["PowerShell", "rm -r -fo dist"],
    ["PowerShell", "Copy-Item -Path src -Destination dist -Recurse -Force"],
    ["PowerShell", "Get-ChildItem dist | Remove-Item -Recurse -Force"],
  ])("allows %s %j", (tool, command) => {
    expect(decide(tool, command)).toBe("allow");
  });
});

describe("the round-2 regressions are fixed", () => {
  it.each([
    ["Bash", "!(git push --force origin main)"],
    ["Bash", "true && !(git push -f origin main)"],
    ["Bash", "!(rm -rf ~)"],
    ["Monitor", "!(git push -f origin main)"],
    ["PowerShell", "Remove-Item ~ -Rec"],
    ["PowerShell", "Remove-Item ~ -Recu -Fo"],
    ["PowerShell", "Remove-Item ~ -Fo"],
    ["Bash", 'export GIT_WORK_TREE=$HOME GIT_DIR=.git; rm -rf "$(git rev-parse --show-toplevel)/.ssh"'],
  ])("blocks %s %j", (tool, command) => {
    expect(decide(tool, command)).toBe("DENY");
  });

  it.each([
    ["PowerShell", "Copy-Item evil.json -Force .claude\\settings.json"],
    ["PowerShell", "Copy-Item evil.json -Verbose .claude\\settings.json"],
    ["PowerShell", "Move-Item evil.json -Force .claude\\settings.json"],
  ])("asks before %s %j", (tool, command) => {
    expect(decide(tool, command)).toBe("ask");
  });

  it("does not throw on a PowerShell mover with a parenthesized or missing value", () => {
    expect(decide("PowerShell", "Copy-Item -Path (Resolve-Path evil.json) -Destination dist")).toBe("allow");
    expect(decide("PowerShell", "Copy-Item -Path x -Destination")).toBe("allow");
  });

  it("only counts a directory change that precedes the git segment", () => {
    const io2 = { gitAlias: (name: string) => (name === "st2" ? "status" : null), readTextFile: () => null };
    const run = (command: string) =>
      evaluateToolCall({ tool_name: "Bash", tool_input: { command }, cwd: repoRoot }, { repoRoot, io: io2 });
    expect(run("git lfs pull && cd ..").ask).toBeUndefined();
    expect(run("cd ../x && git st2").ask).toBe(true);
  });
});
