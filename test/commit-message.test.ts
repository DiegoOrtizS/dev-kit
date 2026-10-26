import { describe, expect, it } from "vitest";
import { TYPES, headerOf, headerProblems, isExempt, isDependabot } from "../src/guardrails/commit-message.mjs";

describe("headerProblems", () => {
  it.each([
    "feat: add the thing",
    "fix(guard): block the thing",
    "docs(readme/install): explain the thing",
    "chore(deps-dev): bump the npm-minor-patch group across 1 directory with 7 updates",
    "refactor(src.guard): split the thing",
    "feat!: drop node 20",
    "feat(api)!: rename the thing",
    "test: a",
    "ci: ok",
    "build: ok",
    "perf: ok",
    "style: ok",
    "revert: feat: add the thing",
    "fix: decide worktrees-clean merges by content, not commit subject (#14)",
    `feat: ${"x".repeat(94)}`,
  ])("accepts %j", (header) => {
    expect(headerProblems(header)).toEqual([]);
  });

  it.each([
    ["Feat: capitalized type", /type/],
    ["feature: unknown type", /type/],
    ["add the thing", /type/],
    ["feat(Guard): uppercase scope", /scope/],
    ["feat(gu ard): space in scope", /scope/],
    ["feat(): empty scope", /scope/],
    ["feat:no space", /subject/],
    ["feat: ", /subject/],
    ["feat:", /subject/],
    ["feat: ends with a period.", /period/],
    ["feat : space before colon", /type/],
    ["feat(scope) : space before colon", /type/],
    ["feat!(scope): bang before scope", /type/],
    [`feat: ${"x".repeat(95)}`, /101 characters, max 100/],
  ])("rejects %j", (header, reason) => {
    const problems = headerProblems(header);
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).toMatch(reason);
  });

  it("reports every problem at once", () => {
    const problems = headerProblems(`wat(Scope): ${"x".repeat(95)}.`);
    expect(problems).toHaveLength(4);
  });

  it("names the eleven types", () => {
    expect(TYPES).toEqual([
      "feat",
      "fix",
      "docs",
      "chore",
      "refactor",
      "test",
      "ci",
      "build",
      "perf",
      "style",
      "revert",
    ]);
  });
});

describe("isExempt", () => {
  it.each([
    "Merge branch 'main' into feat/x",
    "Merge pull request #1 from x/y",
    'Revert "feat: add the thing"',
    "fixup! feat: add the thing",
    "squash! feat: add the thing",
  ])("exempts %j", (header) => {
    expect(isExempt(header)).toBe(true);
  });

  it.each(["merge main", "revert: thing", "fixup feat: x", "feat: Merge the things"])(
    "does not exempt %j",
    (header) => {
      expect(isExempt(header)).toBe(false);
    },
  );
});

describe("headerOf", () => {
  it("takes the first line", () => {
    expect(headerOf("feat: thing\n\nbody\n")).toBe("feat: thing");
  });

  it("skips leading blank lines and trims trailing whitespace", () => {
    expect(headerOf("\n\n  feat: thing  \nbody")).toBe("feat: thing");
  });

  it("drops comment lines when asked, as a commit-msg hook sees them", () => {
    const message = "# Please enter the commit message\n#\nfeat: thing\n# On branch main\n";
    expect(headerOf(message, { stripComments: true })).toBe("feat: thing");
    expect(headerOf(message)).toBe("# Please enter the commit message");
  });

  it("handles CRLF and an empty message", () => {
    expect(headerOf("feat: thing\r\n\r\nbody")).toBe("feat: thing");
    expect(headerOf("")).toBe("");
    expect(headerOf("# only comments\n", { stripComments: true })).toBe("");
  });
});

describe("isDependabot", () => {
  it("matches the bot by name or email, case-insensitively", () => {
    expect(isDependabot("dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com")).toBe(true);
    expect(isDependabot("Someone", "Dependabot@example.com")).toBe(true);
    expect(isDependabot("Diego", "diego@example.com")).toBe(false);
  });
});
