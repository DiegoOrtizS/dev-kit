import { describe, expect, it } from "vitest";
import { addedLines, parseNameList, parsePrePush } from "../src/guardrails/git-parse.mjs";

describe("parsePrePush", () => {
  it("parses every update line", () => {
    const stdin = "refs/heads/a aaa refs/heads/main bbb\nrefs/heads/c ccc refs/heads/d ddd\n";
    expect(parsePrePush(stdin)).toEqual([
      { localRef: "refs/heads/a", localSha: "aaa", remoteRef: "refs/heads/main", remoteSha: "bbb" },
      { localRef: "refs/heads/c", localSha: "ccc", remoteRef: "refs/heads/d", remoteSha: "ddd" },
    ]);
  });

  it("ignores blank lines and CRLF", () => {
    expect(parsePrePush("\r\nrefs/heads/a aaa refs/heads/b bbb\r\n\r\n")).toHaveLength(1);
  });

  it("returns nothing for empty input", () => {
    expect(parsePrePush("")).toEqual([]);
  });
});

describe("parseNameList", () => {
  it("splits on NUL and keeps paths with spaces and non-ascii characters", () => {
    expect(parseNameList("docs/a b.md\0src/ñ.ts\0")).toEqual(["docs/a b.md", "src/ñ.ts"]);
  });

  it("returns nothing for empty input", () => {
    expect(parseNameList("")).toEqual([]);
  });
});

describe("addedLines", () => {
  const diff = [
    "diff --git a/a.ts b/a.ts",
    "index 1..2 100644",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1,0 +5,2 @@",
    "+first",
    "+second",
    "@@ -9 +12 @@",
    "-removed",
    "+replacement",
    "diff --git a/b.ts b/b.ts",
    "--- a/b.ts",
    "+++ b/b.ts",
    "@@ -0,0 +1 @@",
    "+only",
  ].join("\n");

  it("reports path, new line number and text of each added line", () => {
    expect(addedLines(diff)).toEqual([
      { path: "a.ts", line: 5, text: "first" },
      { path: "a.ts", line: 6, text: "second" },
      { path: "a.ts", line: 12, text: "replacement" },
      { path: "b.ts", line: 1, text: "only" },
    ]);
  });

  it("keeps an added line whose content starts with plus signs", () => {
    const tricky = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -0,0 +1,2 @@",
      "+++ b/fake",
      "+ok",
    ].join("\n");
    expect(addedLines(tricky)).toEqual([
      { path: "a.ts", line: 1, text: "++ b/fake" },
      { path: "a.ts", line: 2, text: "ok" },
    ]);
  });

  it("skips deleted files and no-newline markers", () => {
    const deleted = [
      "diff --git a/gone.ts b/gone.ts",
      "--- a/gone.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-x",
      "\ No newline at end of file",
    ].join("\n");
    expect(addedLines(deleted)).toEqual([]);
  });
});
