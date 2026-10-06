import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config.mjs";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const repoRoot = "/work/bot";
const gitflow = normalizeConfig({
  protectedBranches: {
    main: { allowMerges: true },
    develop: { allowedPaths: ["^docs/"], allowMerges: true, blockAgentPush: false },
  },
  blockedPaths: { read: ["^profile_[^/]*/"], write: ["^profile_[^/]*/", "^state/"] },
});

const run = (tool_name: string, tool_input: Record<string, unknown>) =>
  evaluateToolCall({ tool_name, tool_input, cwd: repoRoot }, { repoRoot, config: gitflow });
const bash = (command: string) => run("Bash", { command });

describe("protected branches from config", () => {
  it.each(["git push origin main", "git push origin HEAD:main", "git push --delete origin main"])(
    "blocks %s",
    (command) => {
      expect(bash(command).block).toBe(true);
    },
  );

  it("names the branch in the reason", () => {
    expect(bash("git push origin main").reason).toContain("main");
  });

  it.each(["git push origin develop", "git push -u origin feature/x"])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });

  it("still blocks force pushes to an unprotected branch", () => {
    expect(bash("git push --force origin develop").block).toBe(true);
  });

  it("protects only main by default", () => {
    const defaults = (command: string) => evaluateToolCall({ tool_name: "Bash", tool_input: { command } });
    expect(defaults("git push origin main").block).toBe(true);
    expect(defaults("git push origin develop").block).toBe(false);
  });
});

describe("blocked paths from config", () => {
  it.each([
    "cat profile_browser/Default/Cookies",
    "grep -r token profile_phantom/",
    "cp profile_window/Local State /tmp/x",
    "Get-Content profile_browser/Preferences",
  ])("blocks reading %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each(["cp report.txt state/report.txt", "mv bot.log state/bot.log"])("blocks writing with %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each(["cat state/bot.log", "tail -n 50 state/bot.log", "cat profile.md", "cat docs/profile_notes.md"])(
    "allows %s",
    (command) => {
      expect(bash(command).block).toBe(false);
    },
  );

  it.each(["Write", "Edit", "MultiEdit"])("blocks %s inside a write-blocked folder", (tool) => {
    expect(run(tool, { file_path: `${repoRoot}/state/STOP`, content: "x", new_string: "x" }).block).toBe(true);
  });

  it("blocks NotebookEdit inside a write-blocked folder", () => {
    expect(run("NotebookEdit", { notebook_path: "state/x.ipynb" }).block).toBe(true);
  });

  it("blocks the Read tool inside a read-blocked folder", () => {
    expect(run("Read", { file_path: `${repoRoot}/profile_browser/Default/Login Data` }).block).toBe(true);
  });

  it("allows writes outside the blocked folders and outside the repository", () => {
    expect(run("Write", { file_path: `${repoRoot}/bot/engine.py`, content: "x = 1" }).block).toBe(false);
    expect(run("Write", { file_path: "/elsewhere/state/x", content: "x" }).block).toBe(false);
  });
});

describe("written secrets from the Python bot", () => {
  const card = ["4532", "0151", "1283", "0366"].join(" ");
  const webhook = ["https://discord", ".com/api/webhooks/", "1".repeat(18), "/", "aB3_-".repeat(14)].join("");

  it.each([
    ["a card number", card],
    ["a Discord webhook", webhook],
  ])("blocks writing %s", (_label, text) => {
    expect(run("Write", { file_path: `${repoRoot}/bot/x.py`, content: `VALUE = "${text}"` }).block).toBe(true);
  });
});
