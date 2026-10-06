import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const binPath = path.resolve(__dirname, "..", "bin", "dev-kit.mjs");
const githubToken = `ghp_${"a1B2c3D4e5F6g7H8i9J0".repeat(2)}`;

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
}

function scanAll() {
  return scan("--all");
}

function scan(mode: string) {
  return spawnSync(process.execPath, [binPath, "scan-secrets", mode], {
    cwd: repo,
    env: isolatedEnv(),
    encoding: "utf8",
  });
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "scan-secrets-"));
  git("init", "-q");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("scan-secrets --all", () => {
  it("passes on clean tracked files", () => {
    writeFileSync(path.join(repo, "a.txt"), "hello\n");
    git("add", "a.txt");
    const result = scanAll();
    expect(result.status).toBe(0);
  });

  it("reports a secret in a tracked file", () => {
    writeFileSync(path.join(repo, "a.txt"), `token=${githubToken}\n`);
    git("add", "a.txt");
    const result = scanAll();
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("a.txt:1");
  });

  it("skips tracked files that are missing from the working tree", () => {
    mkdirSync(path.join(repo, "dir"));
    writeFileSync(path.join(repo, "dir", "gone.txt"), "hello\n");
    writeFileSync(path.join(repo, "kept.txt"), `token=${githubToken}\n`);
    git("add", ".");
    rmSync(path.join(repo, "dir"), { recursive: true });
    const result = scanAll();
    expect(result.stderr).not.toContain("ENOENT");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("kept.txt:1");
  });
});

describe("scan-secrets --staged", () => {
  it("blocks a staged secret", () => {
    writeFileSync(path.join(repo, "a.txt"), `token=${githubToken}\n`);
    git("add", "a.txt");
    const result = scan("--staged");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("a.txt:1 github-token");
  });

  it("blocks staged paths listed in blockedPaths.commit", () => {
    mkdirSync(path.join(repo, ".claude"));
    writeFileSync(path.join(repo, ".claude", "guard.json"), JSON.stringify({ blockedPaths: { commit: ["^state/"] } }));
    mkdirSync(path.join(repo, "state"));
    writeFileSync(path.join(repo, "state", "purchases.db"), "rows\n");
    git("add", "state/purchases.db");
    const result = scan("--staged");
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("state/purchases.db:0 blocked-path");
  });

  it("passes a clean staged change", () => {
    writeFileSync(path.join(repo, "a.txt"), "hello\n");
    git("add", "a.txt");
    expect(scan("--staged").status).toBe(0);
  });
});
