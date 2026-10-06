import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { addedLines, parseNameList } from "./git-parse.mjs";
import { findSecrets } from "./rules.mjs";

const MAX_BUFFER = 256 * 1024 * 1024;

function git(...args) {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], { encoding: "utf8", maxBuffer: MAX_BUFFER });
}

function blockedPathFindings(paths, config) {
  return paths
    .filter((path) => config.blockedPaths.commit.some((pattern) => pattern.test(path)))
    .map((path) => ({ path, line: 0, rule: "blocked-path" }));
}

function stagedFindings(config) {
  const staged = parseNameList(git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"));
  const contentFindings = addedLines(git("diff", "--cached", "-U0", "--no-color", "--no-renames"))
    .filter(({ path }) => !config.secretScan.skipFiles.has(path))
    .flatMap(({ path, line, text }) => findSecrets(text).map(({ rule }) => ({ path, line, rule })));
  return [...blockedPathFindings(staged, config), ...contentFindings];
}

function trackedFindings(config) {
  const tracked = parseNameList(git("ls-files", "-z"));
  const contentFindings = tracked
    .filter((path) => !config.secretScan.skipFiles.has(path) && existsSync(path))
    .flatMap((path) => {
      const text = readFileSync(path, "utf8");
      return findSecrets(text).map(({ rule, line }) => ({ path, line, rule }));
    });
  return [...blockedPathFindings(tracked, config), ...contentFindings];
}

export function scanSecrets(config, [mode]) {
  if (mode !== "--staged" && mode !== "--all") {
    process.stderr.write("usage: dev-kit scan-secrets --staged | --all\n");
    process.exit(2);
  }
  const findings = mode === "--staged" ? stagedFindings(config) : trackedFindings(config);
  for (const { path, line, rule } of findings) process.stdout.write(`${path}:${line} ${rule}\n`);
  if (findings.length > 0) {
    process.stderr.write("Possible secret or blocked path. Never commit it, and never bypass with --no-verify.\n");
  }
  process.exit(findings.length > 0 ? 1 : 0);
}
