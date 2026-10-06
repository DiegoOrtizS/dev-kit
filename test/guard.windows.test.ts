import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config.mjs";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const home = homedir();
const repoRoot = path.join(home, "repos", "bot");
const config = normalizeConfig({ blockedPaths: { read: ["^profile_[^/]*/"], write: ["^state/"] } });
const bash = (command: string) =>
  evaluateToolCall({ tool_name: "Bash", tool_input: { command }, cwd: repoRoot }, { repoRoot, config });
const gitBashRoot = repoRoot
  .replace(/\\/g, "/")
  .replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`);

describe.runIf(process.platform === "win32")("blocked paths on Windows", () => {
  it.each([
    `cat ${gitBashRoot}/profile_browser/Cookies`,
    "cat ~/repos/bot/profile_browser/Cookies",
    "cat PROFILE_Browser/Cookies",
    `cat "${path.join(repoRoot, "profile_browser", "Cookies")}"`,
  ])("blocks reading %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each([`cp x ${gitBashRoot}/state/STOP`, "cp x ~/repos/bot/state/STOP", "cp x STATE/STOP"])(
    "blocks writing %s",
    (command) => {
      expect(bash(command).block).toBe(true);
    },
  );

  it("allows a path on another drive", () => {
    expect(bash("cat /d/profile_browser/Cookies").block).toBe(false);
  });
});

describe("blocked paths with the home shortcut", () => {
  it("blocks ~ paths that land inside the repository", () => {
    expect(bash("cat ~/repos/bot/profile_browser/Cookies").block).toBe(true);
  });
});
