import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const binPath = path.resolve(__dirname, "..", "bin", "dev-kit.mjs");
let repo: string;

function isolatedEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return env;
}

function git(...args: string[]) {
  const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
    cwd: repo,
    env: isolatedEnv(),
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function write(file: string, content = "x\n") {
  mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
  writeFileSync(path.join(repo, file), content);
}

function checkBranch(mode: string, input = "") {
  return spawnSync(process.execPath, [binPath, "check-branch", mode], {
    cwd: repo,
    env: isolatedEnv(),
    encoding: "utf8",
    input,
  });
}

function configure(value: unknown) {
  write(".claude/guard.json", JSON.stringify(value));
  git("add", ".claude/guard.json");
  git("commit", "-q", "-m", "chore: config");
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "check-branch-"));
  git("init", "-q", "-b", "main");
  write("README.md");
  git("add", "README.md");
  git("commit", "-q", "-m", "chore: init");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("check-branch --staged", () => {
  it("blocks code staged on main by default", () => {
    write("src/a.ts");
    git("add", "src/a.ts");
    const result = checkBranch("--staged");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Not allowed directly on main");
    expect(result.stderr).toContain("src/a.ts");
  });

  it("allows paths on the branch allowlist", () => {
    configure({ protectedBranches: { main: { allowedPaths: ["^docs/"] } } });
    write("docs/a.md");
    git("add", "docs/a.md");
    expect(checkBranch("--staged").status).toBe(0);
  });

  it("protects any branch named in the config", () => {
    configure({ protectedBranches: { main: {}, develop: { allowedPaths: ["^docs/"] } } });
    git("checkout", "-q", "-b", "develop");
    write("bot/engine.py");
    git("add", "bot/engine.py");
    const result = checkBranch("--staged");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("develop");
  });

  it("lets a merge through when the branch allows merges", () => {
    configure({ protectedBranches: { main: { allowMerges: true } } });
    git("checkout", "-q", "-b", "feature/x");
    write("bot/engine.py");
    git("add", "bot/engine.py");
    git("commit", "-q", "-m", "feat: engine");
    git("checkout", "-q", "main");
    git("merge", "--no-ff", "--no-commit", "feature/x");
    expect(checkBranch("--staged").status).toBe(0);
  });

  it("ignores unprotected branches", () => {
    git("checkout", "-q", "-b", "feature/x");
    write("src/a.ts");
    git("add", "src/a.ts");
    expect(checkBranch("--staged").status).toBe(0);
  });
});

describe("check-branch --pre-push", () => {
  it("blocks a push to main that carries code", () => {
    const base = git("rev-parse", "HEAD");
    write("src/a.ts");
    git("add", "src/a.ts");
    git("commit", "-q", "-m", "feat: a");
    const head = git("rev-parse", "HEAD");
    const result = checkBranch("--pre-push", `refs/heads/main ${head} refs/heads/main ${base}\n`);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("src/a.ts");
  });

  it("allows a push to a work branch", () => {
    const head = git("rev-parse", "HEAD");
    const zero = "0".repeat(40);
    expect(checkBranch("--pre-push", `refs/heads/feat/x ${head} refs/heads/feat/x ${zero}\n`).status).toBe(0);
  });
});
