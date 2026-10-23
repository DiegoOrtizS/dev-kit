import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config.mjs";
import {
  CONTEXT_MARKER,
  checkContextSection,
  checkDocBudget,
  checkSettings,
  syncProblems,
} from "../src/guardrails/sync-check.mjs";

const kitRoot = path.resolve(__dirname, "..");
let repo: string;

function writeSettings(env: Record<string, unknown>) {
  write(".claude/settings.json", JSON.stringify({ env }, null, 2));
}

function write(file: string, content: string) {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), content);
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "dev-kit-context-"));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

const limits = "# x\n\n## Never\n\n## Where to write\n\n";

describe("checkContextSection", () => {
  it("accepts the CLAUDE.md template", () => {
    write("CLAUDE.md", readFileSync(path.join(kitRoot, "templates", "CLAUDE.md"), "utf8"));
    expect(checkContextSection(repo)).toEqual([]);
  });

  it("accepts the marker under a heading in any language", () => {
    write(
      "CLAUDE.md",
      `# x\n\n## Prohibido\n\n## Dónde se escribe\n\n## Presupuesto de contexto\n\n${CONTEXT_MARKER}\n\n- Un documento de más de ~3 KB se lee con \`grep -n\`.\n`,
    );
    expect(checkContextSection(repo)).toEqual([]);
  });

  it("accepts the marker in .claude/CLAUDE.md only, with CRLF line endings", () => {
    write("CLAUDE.md", limits);
    write(".claude/CLAUDE.md", `${limits}## Context budget\n${CONTEXT_MARKER}\n`.replace(/\n/g, "\r\n"));
    expect(checkContextSection(repo)).toEqual([]);
  });

  it("reports a CLAUDE.md without the marker, even with a translated heading", () => {
    write("CLAUDE.md", `${limits}## Context budget\n\n- grep, then a bounded read.\n`);
    expect(checkContextSection(repo)).toEqual([
      `CLAUDE.md: no ${CONTEXT_MARKER}; put it under the context budget heading, or copy that section from dev-kit templates/CLAUDE.md`,
    ]);
  });

  it("names both files when neither carries the marker", () => {
    write("CLAUDE.md", limits);
    write(".claude/CLAUDE.md", limits);
    expect(checkContextSection(repo)[0]).toMatch(
      /^CLAUDE\.md or \.claude\/CLAUDE\.md: no <!-- dev-kit:context-budget -->/,
    );
  });

  it("does not count a marker inside a fenced code block", () => {
    write("CLAUDE.md", `${limits}## Context budget\n\n\`\`\`md\n${CONTEXT_MARKER}\n\`\`\`\n`);
    expect(checkContextSection(repo)).toHaveLength(1);
  });

  it("reports a marker that is not right under a heading", () => {
    write("CLAUDE.md", `${limits}## Context budget\n\n- a rule\n\n${CONTEXT_MARKER}\n`);
    expect(checkContextSection(repo)).toEqual([
      `CLAUDE.md: ${CONTEXT_MARKER} must sit on its own line right under a "## " heading`,
    ]);
  });

  it("leaves a missing CLAUDE.md to checkClaudeMd", () => {
    expect(checkContextSection(repo)).toEqual([]);
  });
});

describe("checkSettings", () => {
  it("accepts the settings template", () => {
    write(".claude/settings.json", readFileSync(path.join(kitRoot, "templates", "claude", "settings.json"), "utf8"));
    expect(checkSettings(repo)).toEqual([]);
  });

  it.each([[{}], [{ CLAUDE_CODE_AUTO_COMPACT_WINDOW: "300000" }], [{ CLAUDE_CODE_AUTO_COMPACT_WINDOW: 1_000_000 }]])(
    "accepts env %j",
    (env) => {
      writeSettings(env);
      expect(checkSettings(repo)).toEqual([]);
    },
  );

  it("passes without a settings file or without env", () => {
    expect(checkSettings(repo)).toEqual([]);
    write(".claude/settings.json", "﻿{}");
    expect(checkSettings(repo)).toEqual([]);
  });

  it("reports the percent override, whatever its value", () => {
    writeSettings({ CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "95", CLAUDE_CODE_AUTO_COMPACT_WINDOW: "400000" });
    expect(checkSettings(repo)).toEqual([
      ".claude/settings.json: env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE is set; remove it, it compacts long before the window fills",
    ]);
  });

  it.each([["200000"], [299_999], ["4e5"], [""], ["abc"]])("reports a compact window of %j", (value) => {
    writeSettings({ CLAUDE_CODE_AUTO_COMPACT_WINDOW: value });
    expect(checkSettings(repo)).toEqual([
      `.claude/settings.json: env.CLAUDE_CODE_AUTO_COMPACT_WINDOW is "${value}"; set it to at least 300000 (template: 400000)`,
    ]);
  });

  it("reports both problems of the copied v0.2.0 settings", () => {
    writeSettings({ CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "50", CLAUDE_CODE_AUTO_COMPACT_WINDOW: "200000" });
    expect(checkSettings(repo)).toHaveLength(2);
  });

  it("reports settings that are not valid JSON", () => {
    write(".claude/settings.json", "{ env: }");
    expect(checkSettings(repo)[0]).toMatch(/^\.claude\/settings\.json: not valid JSON/);
  });

  it("ignores settings.local.json, which is personal", () => {
    write(".claude/settings.local.json", JSON.stringify({ env: { CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "50" } }));
    expect(checkSettings(repo)).toEqual([]);
  });
});

describe("checkDocBudget", () => {
  it("passes when every listed doc is within its budget", () => {
    write("CLAUDE.md", "a".repeat(100));
    write("docs/pending.md", "b".repeat(4096));
    expect(checkDocBudget(repo, { "CLAUDE.md": 100, "docs/pending.md": 4096 })).toEqual([]);
  });

  it("reports a doc over its budget with its size", () => {
    write("docs/pending.md", "b".repeat(4097));
    expect(checkDocBudget(repo, { "docs/pending.md": 4096 })).toEqual([
      "docs/pending.md: 4097 bytes, over its budget of 4096; move detail or closed items to an archive doc",
    ]);
  });

  it("reports a listed doc that is missing", () => {
    expect(checkDocBudget(repo, { "docs/follow-ups.md": 4096 })).toEqual([
      "docs/follow-ups.md: listed in guard.json syncCheck.docBudget but missing; restore it or drop the entry",
    ]);
  });

  it("counts UTF-8 bytes with LF line endings, so Windows and Linux agree", () => {
    write("docs/progress.md", "﻿añ\r\nb\r\n");
    expect(checkDocBudget(repo, { "docs/progress.md": 6 })).toEqual([]);
    expect(checkDocBudget(repo, { "docs/progress.md": 5 })).toHaveLength(1);
  });

  it("checks nothing without a budget", () => {
    expect(checkDocBudget(repo)).toEqual([]);
  });

  it("runs as part of syncProblems from guard.json", () => {
    write("docs/pending.md", "b".repeat(10));
    const config = normalizeConfig({ syncCheck: { docBudget: { "docs/pending.md": 5 } } });
    expect(syncProblems(repo, config)).toContain(
      "docs/pending.md: 10 bytes, over its budget of 5; move detail or closed items to an archive doc",
    );
  });
});
