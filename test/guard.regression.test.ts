import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";
import { everydayCases, protectedCases } from "./guard.regression.fixture.js";

const repoRoot = "C:/Users/Diego/repos/tcg-store";
const io = { gitAlias: (name: string) => (name === "nuke" ? "reset --hard" : null), readTextFile: () => null };
const rank = (decision: string) => ({ DENY: 3, THROW: 3, ask: 2, allow: 1 })[decision] ?? 0;
const decide = (tool: string, command: string) => {
  const input = ["Bash", "PowerShell", "Monitor"].includes(tool) ? { command } : { file_path: command };
  const verdict = evaluateToolCall({ tool_name: tool, tool_input: input, cwd: repoRoot }, { repoRoot, io });
  return verdict.block ? "DENY" : verdict.ask ? "ask" : "allow";
};

const intentionallyRelaxed = new Set([
  'Bash\u0000rm -rf "$(git rev-parse --show-toplevel)/dist"',
  'Bash\u0000rm -rf "`git rev-parse --show-toplevel`/src"',
]);

describe("no decision is weaker than f33b117 or origin/main", () => {
  it.each(protectedCases)("%s %j: f33=%s main=%s", (tool, command, atF33b117, atMain) => {
    if (intentionallyRelaxed.has(`${tool}\u0000${command}`)) return;
    const floor = Math.max(rank(atF33b117), rank(atMain));
    expect(rank(decide(tool, command)), `${tool} ${command}`).toBeGreaterThanOrEqual(floor);
  });

  it("the documented exception resolves show-toplevel for a sole-segment delete", () => {
    expect(decide("Bash", 'rm -rf "$(git rev-parse --show-toplevel)/dist"')).toBe("allow");
    expect(decide("Bash", 'rm -rf "$(git rev-parse --show-toplevel)"')).toBe("DENY");
  });
});

describe("everyday commands stay allowed", () => {
  it.each(everydayCases)("allows %s %j", (tool, command) => {
    expect(decide(tool, command)).toBe("allow");
  });
});

describe("the round-3 categories are fixed", () => {
  it.each([
    ["Bash", "ls @($(git push -f origin main))"],
    ["Bash", "echo x@($(git push -f origin main))"],
    ["Bash", "ls ?(`git push -f origin main`)"],
    ["Bash", "ls @(')'); git push -f origin main"],
    ["Bash", 'ls @(")")\ngit reset --hard'],
    ["PowerShell", "rm -rf ~"],
    ["PowerShell", "rm -fr ~"],
    ["PowerShell", "del /s /q ~"],
    ["PowerShell", "erase /s ~"],
    ["PowerShell", "rmdir /s /q ~"],
    ["Bash", 'source ./env.sh; rm -rf "$(git rev-parse --show-toplevel)/.ssh"'],
    ["Bash", 'eval cd ../other; rm -rf "$(git rev-parse --show-toplevel)/src"'],
    ["Bash", 'export GIT_WORK_TREE+=$HOME GIT_DIR+=.git; rm -rf "$(git rev-parse --show-toplevel)/.ssh"'],
    ["Bash", "cd ../other && git nuke"],
    ["Bash", "cd ../other && git -C . nuke"],
    ["Bash", "pushd ../other && git nuke"],
    ["PowerShell", "Set-Location ..\\other; git nuke"],
    ["Bash", "git nuke"],
  ])("blocks %s %j", (tool, command) => {
    expect(decide(tool, command)).toBe("DENY");
  });

  it.each([
    ["Bash", "[[ $x == @(a|b) ]] && echo ok"],
    ["Bash", "ls !(node_modules)"],
    ["Bash", "rm -rf dist/@(a|b)"],
    ["PowerShell", "rm -r -fo dist"],
    ["PowerShell", "Remove-Item -Recurse -Force dist, coverage"],
  ])("allows %s %j", (tool, command) => {
    expect(decide(tool, command)).toBe("allow");
  });
});
