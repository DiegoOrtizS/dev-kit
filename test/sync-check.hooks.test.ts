import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkHookMatchers } from "../src/guardrails/sync-hooks.mjs";

const kitRoot = path.resolve(__dirname, "..");
const guardHook = {
  type: "command",
  command: 'node "$(git rev-parse --show-toplevel)/tools/claude-hooks/guard.mjs" || exit 2',
  onFailure: "block",
};
const guardHookNoFailure = {
  type: "command",
  command: 'node "$(git rev-parse --show-toplevel)/tools/claude-hooks/guard.mjs" || exit 2',
};
let repo: string;

function writeSettings(settings: unknown) {
  mkdirSync(path.join(repo, ".claude"), { recursive: true });
  writeFileSync(path.join(repo, ".claude", "settings.json"), JSON.stringify(settings, null, 2));
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "dev-kit-hooks-"));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("checkHookMatchers", () => {
  it("accepts the template", () => {
    writeSettings(JSON.parse(readFileSync(path.join(kitRoot, "templates", "claude", "settings.json"), "utf8")));
    expect(checkHookMatchers(repo)).toEqual([]);
  });

  it("accepts a catch-all matcher and tools split over several entries", () => {
    writeSettings({ hooks: { PreToolUse: [{ matcher: "*", hooks: [guardHook] }] } });
    expect(checkHookMatchers(repo)).toEqual([]);
    writeSettings({
      hooks: {
        PreToolUse: [
          { matcher: "Bash|PowerShell|Monitor|Read", hooks: [guardHook] },
          { matcher: "Write|Edit|MultiEdit|NotebookEdit", hooks: [guardHook] },
        ],
      },
    });
    expect(checkHookMatchers(repo)).toEqual([]);
  });

  it("reports the tools a consumer matcher lacks", () => {
    writeSettings({
      hooks: { PreToolUse: [{ matcher: "Bash|PowerShell|Write|Edit|MultiEdit", hooks: [guardHook] }] },
    });
    expect(checkHookMatchers(repo)).toEqual([
      '.claude/settings.json: the PreToolUse matcher for tools/claude-hooks/guard.mjs lacks Monitor, NotebookEdit; the template has "Bash|PowerShell|Monitor|Write|Edit|MultiEdit|NotebookEdit"',
    ]);
  });

  it("does not count a matcher that belongs to another hook", () => {
    writeSettings({
      hooks: {
        PreToolUse: [
          { matcher: "Bash|PowerShell|Monitor|Write|Edit|MultiEdit", hooks: [guardHook] },
          { matcher: "NotebookEdit", hooks: [{ type: "command", command: "echo other" }] },
        ],
      },
    });
    expect(checkHookMatchers(repo)).toEqual([
      '.claude/settings.json: the PreToolUse matcher for tools/claude-hooks/guard.mjs lacks NotebookEdit; the template has "Bash|PowerShell|Monitor|Write|Edit|MultiEdit|NotebookEdit"',
    ]);
  });

  it("reports a guard hook that lacks onFailure block", () => {
    writeSettings({
      hooks: {
        PreToolUse: [
          { matcher: "Bash|PowerShell|Monitor|Write|Edit|MultiEdit|NotebookEdit", hooks: [guardHookNoFailure] },
        ],
      },
    });
    expect(checkHookMatchers(repo)).toEqual([
      '.claude/settings.json: the tools/claude-hooks/guard.mjs hook is missing "onFailure": "block"; without it a timed-out guard lets the call through (Claude Code >= 2.1.295). Copy it from dev-kit templates/claude/settings.json',
    ]);
  });

  it("reports settings without the guard hook", () => {
    writeSettings({ hooks: { PostToolUse: [{ matcher: "Write", hooks: [guardHook] }] } });
    expect(checkHookMatchers(repo)).toEqual([
      ".claude/settings.json: no PreToolUse hook runs tools/claude-hooks/guard.mjs; copy the hooks block from dev-kit templates/claude/settings.json",
    ]);
  });

  it("passes without a settings file and leaves invalid JSON to checkSettings", () => {
    expect(checkHookMatchers(repo)).toEqual([]);
    mkdirSync(path.join(repo, ".claude"), { recursive: true });
    writeFileSync(path.join(repo, ".claude", "settings.json"), "{");
    expect(checkHookMatchers(repo)).toEqual([]);
  });
});
