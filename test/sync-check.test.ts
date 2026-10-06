import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeConfig } from "../src/config.mjs";
import {
  checkAgents,
  checkClaudeMd,
  checkShims,
  parseFrontmatter,
  syncProblems,
} from "../src/guardrails/sync-check.mjs";

const kitRoot = path.resolve(__dirname, "..");
let repo: string;

function write(file: string, content: string) {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), content);
}

function installShims() {
  mkdirSync(path.join(repo, "tools", "claude-hooks"), { recursive: true });
  for (const name of ["guard.mjs", "lint-after-edit.mjs"]) {
    copyFileSync(path.join(kitRoot, "shim", name), path.join(repo, "tools", "claude-hooks", name));
  }
}

const template = (name: string) => readFileSync(path.join(kitRoot, "templates", "agents", `${name}.md`), "utf8");

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "dev-kit-sync-"));
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("checkShims", () => {
  it("passes when the shims match the kit, even with CRLF line endings", () => {
    installShims();
    const shim = path.join(repo, "tools", "claude-hooks", "guard.mjs");
    writeFileSync(shim, readFileSync(shim, "utf8").replace(/\n/g, "\r\n"));
    expect(checkShims(repo)).toEqual([]);
  });

  it("reports a missing or edited shim", () => {
    installShims();
    write("tools/claude-hooks/guard.mjs", "process.exit(0);\n");
    rmSync(path.join(repo, "tools", "claude-hooks", "lint-after-edit.mjs"));
    const problems = checkShims(repo);
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("guard.mjs: differs");
    expect(problems.join("\n")).toContain("lint-after-edit.mjs: missing");
  });
});

describe("checkAgents", () => {
  it("accepts an agent whose policy matches the template, whatever its body says", () => {
    write(".claude/agents/mechanic.md", `${template("mechanic").split("---\n\n")[0]}---\n\nResponde en español.\n`);
    expect(checkAgents(repo, {})).toEqual([]);
  });

  it("compares tools as a set", () => {
    write(
      ".claude/agents/mechanic.md",
      template("mechanic").replace(
        "tools: Read, Grep, Glob, Bash, Write, Edit",
        "tools: Edit, Write, Bash, Glob, Grep, Read",
      ),
    );
    expect(checkAgents(repo, {})).toEqual([]);
  });

  it("reports model, effort and maxTurns drift", () => {
    write(
      ".claude/agents/security-auditor.md",
      "---\nname: security-auditor\nmodel: sonnet\ntools: Read, Grep, Glob, Bash, WebFetch\n---\n",
    );
    const problems = checkAgents(repo, {});
    expect(problems).toEqual([
      '.claude/agents/security-auditor.md: model is "sonnet", template has "opus"',
      '.claude/agents/security-auditor.md: effort is "(missing)", template has "high"',
      '.claude/agents/security-auditor.md: maxTurns is "(missing)", template has "30"',
    ]);
  });

  it("skips fields listed as deliberate overrides", () => {
    write(".claude/agents/mechanic.md", template("mechanic").replace("model: sonnet", "model: haiku"));
    expect(checkAgents(repo, { agentOverrides: { mechanic: ["model"] } })).toEqual([]);
  });

  it("ignores agents that have no template", () => {
    write(".claude/agents/store-scout.md", "---\nname: store-scout\nmodel: haiku\n---\n");
    expect(checkAgents(repo, {})).toEqual([]);
  });
});

describe("checkClaudeMd", () => {
  it.each([
    ["CLAUDE.md", "# x\n\n## Never\n\n- a\n\n## Where to write\n"],
    [".claude/CLAUDE.md", "# x\n\n## Never\n\n## Where to write\n\n## Rules\n"],
    ["CLAUDE.md", "# x\n\n## Prohibido\n\n## Dónde se escribe\n"],
  ])("accepts %s with the limits first", (file, content) => {
    write(file, content);
    expect(checkClaudeMd(repo)).toEqual([]);
  });

  it("reports a CLAUDE.md that encourages before it limits", () => {
    write("CLAUDE.md", "# x\n\n## Stack\n\n## Never\n");
    expect(checkClaudeMd(repo)).toHaveLength(2);
  });

  it("reports a missing CLAUDE.md", () => {
    expect(checkClaudeMd(repo)).toEqual(["CLAUDE.md: missing"]);
  });
});

describe("syncProblems", () => {
  it("is clean for a repo built from the templates", () => {
    installShims();
    write("CLAUDE.md", readFileSync(path.join(kitRoot, "templates", "CLAUDE.md"), "utf8"));
    write(".claude/agents/code-reviewer.md", template("code-reviewer"));
    expect(syncProblems(repo, normalizeConfig())).toEqual([]);
  });
});

describe("parseFrontmatter", () => {
  it("reads simple key and value lines", () => {
    expect(parseFrontmatter("---\nname: a\nmaxTurns: 15\n---\nbody")).toEqual({ name: "a", maxTurns: "15" });
  });

  it("returns nothing without frontmatter", () => {
    expect(parseFrontmatter("# title")).toEqual({});
  });
});

describe("sync-check review cases", () => {
  it("reads quoted values and drops trailing comments", () => {
    expect(parseFrontmatter("---\nmodel: \"sonnet\"\neffort: 'low'\nmaxTurns: 15 # cap\n---\n")).toEqual({
      model: "sonnet",
      effort: "low",
      maxTurns: "15",
    });
  });

  it("does not take a longer dash line as the closing delimiter", () => {
    expect(parseFrontmatter("---\nmodel: a\n----\nmore: b\n---\n")).toEqual({ model: "a", more: "b" });
  });

  it("reports required agents that are missing", () => {
    write(".claude/agents/mechanic.md", template("mechanic"));
    expect(checkAgents(repo, { requiredAgents: ["code-reviewer", "mechanic"] })).toEqual([
      ".claude/agents/code-reviewer.md: required by guard.json syncCheck.requiredAgents but missing",
    ]);
  });

  it("ignores headings inside fenced code blocks", () => {
    write("CLAUDE.md", "# x\n\n```md\n## Never\n## Where to write\n```\n\n## Stack\n");
    expect(checkClaudeMd(repo)).toHaveLength(2);
  });

  it("checks both CLAUDE.md files when both exist", () => {
    write("CLAUDE.md", "# x\n\n## Never\n\n## Where to write\n");
    write(".claude/CLAUDE.md", "# x\n\n## Stack\n");
    expect(checkClaudeMd(repo).every((problem) => problem.startsWith(".claude/CLAUDE.md"))).toBe(true);
    expect(checkClaudeMd(repo)).toHaveLength(2);
  });
});
