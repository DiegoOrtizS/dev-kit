import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config.mjs";
import { checkDocBudget, syncProblems } from "../src/guardrails/sync-check.mjs";

let repo: string;

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
