import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeConfig } from "../src/config.mjs";
import { releasePlan, releaseTag } from "../src/release/release-tag.mjs";

const binPath = path.resolve(__dirname, "..", "bin", "dev-kit.mjs");
const gitEnv = Object.entries(process.env).filter(([key]) => key.startsWith("GIT_"));
let root: string;
let repo: string;

function git(cwd: string, ...args: string[]) {
  const result = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], {
    cwd,
    encoding: "utf8",
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function packageJson(version: string) {
  return JSON.stringify({ name: "dev-kit", version });
}

const lsRemote = (...refs: string[]) => refs.map((ref) => `${"a".repeat(40)}\t${ref}`).join("\n") + "\n";

describe("releasePlan", () => {
  it("tags a version that has no tag yet", () => {
    expect(releasePlan(packageJson("0.4.0"), "")).toEqual({ tag: "v0.4.0", create: true });
  });

  it("does nothing when the tag already exists, whether listed peeled or not", () => {
    expect(releasePlan(packageJson("0.4.0"), lsRemote("refs/tags/v0.4.0", "refs/tags/v0.4.0^{}"))).toEqual({
      tag: "v0.4.0",
      create: false,
    });
    expect(releasePlan(packageJson("0.4.0"), lsRemote("refs/tags/v0.4.0^{}")).create).toBe(false);
  });

  it("does not mistake a longer tag for the version", () => {
    expect(releasePlan(packageJson("0.4.0"), lsRemote("refs/tags/v0.4.0-rc.1")).create).toBe(true);
  });

  it("accepts a prerelease version", () => {
    expect(releasePlan(packageJson("1.0.0-rc.1"), "")).toEqual({ tag: "v1.0.0-rc.1", create: true });
  });

  it.each(["0.4", "v0.4.0", "0.4.0 ", "", "latest"])("rejects the version %j", (version) => {
    expect(() => releasePlan(packageJson(version), "")).toThrow(/version/);
  });

  it("rejects a package.json without a version", () => {
    expect(() => releasePlan(JSON.stringify({ name: "dev-kit" }), "")).toThrow(/version/);
  });
});

describe("release-tag against a remote", () => {
  beforeAll(() => {
    for (const [key] of gitEnv) delete process.env[key];
  });

  afterAll(() => {
    for (const [key, value] of gitEnv) process.env[key] = value;
  });

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "release-tag-"));
    const origin = path.join(root, "origin.git");
    repo = path.join(root, "repo");
    git(root, "init", "-q", "--bare", origin);
    git(root, "init", "-q", "-b", "main", repo);
    writeFileSync(path.join(repo, "package.json"), packageJson("0.1.0"));
    git(repo, "add", "package.json");
    git(repo, "commit", "-q", "-m", "chore: start");
    git(repo, "remote", "add", "origin", origin);
    git(repo, "push", "-q", "origin", "main");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it("prints a plan to create the tag when the remote lacks it", () => {
    const out: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    expect(releaseTag(normalizeConfig(), [], repo)).toEqual({ tag: "v0.1.0", create: true });
    expect(out.join("")).toBe("tag=v0.1.0\ncreate=true\n");
  });

  it("prints a plan to skip when the remote already has the tag", () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    git(repo, "tag", "-a", "v0.1.0", "-m", "v0.1.0");
    git(repo, "push", "-q", "origin", "v0.1.0");
    expect(releaseTag(normalizeConfig(), [], repo)).toEqual({ tag: "v0.1.0", create: false });
  });

  it("runs through the dev-kit bin", () => {
    const result = spawnSync(process.execPath, [binPath, "release-tag"], { cwd: repo, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("tag=v0.1.0\ncreate=true\n");
  });
});
