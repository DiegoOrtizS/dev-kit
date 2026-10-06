import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const guardPath = fileURLToPath(new URL("../src/guard/guard.mjs", import.meta.url));
const settingsPath = fileURLToPath(new URL("../.claude/settings.json", import.meta.url));

const runGuard = (input: string) => spawnSync(process.execPath, [guardPath], { input, encoding: "utf8" });
const call = (tool_name: string, tool_input: Record<string, unknown>) => JSON.stringify({ tool_name, tool_input });

describe("guard CLI exit codes", () => {
  it.each([
    ["empty input", ""],
    ["whitespace input", "  \n"],
    ["null", "null"],
    ["a JSON array", "[]"],
    ["a JSON string", '"git push -f"'],
    ["non-JSON", "garbage"],
    ["a payload without tool_name", "{}"],
  ])("fails closed on %s", (_label, input) => {
    const result = runGuard(input);
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Blocked/);
  });

  it("fails closed when stdin is closed", () => {
    const result = spawnSync(process.execPath, [guardPath], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    expect(result.status).toBe(2);
  });

  it("exits 2 with the reason for a blocked Bash call", () => {
    const result = runGuard(call("Bash", { command: "git push --force" }));
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/force/i);
  });

  it("exits 2 for a blocked PowerShell call", () => {
    expect(runGuard(call("PowerShell", { command: "git push origin main" })).status).toBe(2);
  });

  it("exits 0 for an allowed call", () => {
    const result = runGuard(call("Bash", { command: "git push -u origin feat/x" }));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("exits 0 for an unrelated tool", () => {
    expect(runGuard(call("Read", { file_path: "README.md" })).status).toBe(0);
  });
});

interface HookGroup {
  matcher: string;
  hooks: [{ command: string }];
}

describe(".claude/settings.json wiring", () => {
  const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
    hooks: { PreToolUse: [HookGroup]; PostToolUse: [HookGroup] };
  };

  it("guards Bash, PowerShell and file writes before tool use, failing closed", () => {
    const group: HookGroup = settings.hooks.PreToolUse[0];
    expect(group.matcher.split("|")).toEqual(
      expect.arrayContaining(["Bash", "PowerShell", "Write", "Edit", "MultiEdit"]),
    );
    const [{ command }] = group.hooks;
    expect(command).toContain("git rev-parse --show-toplevel");
    expect(command).toContain("src/guard/guard.mjs");
    expect(command).toMatch(/\|\| exit 2$/);
  });

  it("lints after edits from the repository root", () => {
    const [{ command }] = settings.hooks.PostToolUse[0].hooks;
    expect(command).toContain("git rev-parse --show-toplevel");
    expect(command).toContain("src/hooks/lint-after-edit.mjs");
  });
});
