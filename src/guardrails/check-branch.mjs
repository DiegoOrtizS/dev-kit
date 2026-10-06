import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseNameList, parsePrePush } from "./git-parse.mjs";
import { isAllowedOnBranch } from "./rules.mjs";

const ZERO_SHA = /^0+$/;
const HEADS = "refs/heads/";

function git(...args) {
  return execFileSync("git", ["-c", "core.quotePath=false", ...args], { encoding: "utf8" });
}

function currentBranch() {
  try {
    return git("symbolic-ref", "--quiet", "--short", "HEAD").trim();
  } catch {
    return "";
  }
}

function mergeInProgress() {
  return existsSync(join(git("rev-parse", "--git-dir").trim(), "MERGE_HEAD"));
}

function changedPaths(...diffArgs) {
  return parseNameList(git("diff", "--name-only", "--no-renames", "-z", ...diffArgs));
}

function rejectedPaths(paths, rules) {
  return paths.filter((path) => !isAllowedOnBranch([path], rules));
}

function stop(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function stopWithPaths(branch, paths) {
  stop(
    `Not allowed directly on ${branch}:\n${paths.map((path) => `  ${path}`).join("\n")}\nUse a work branch and a pull request instead.`,
  );
}

function requireCommit(sha, branch) {
  try {
    git("cat-file", "-e", `${sha}^{commit}`);
  } catch {
    stop(`Cannot verify the push to ${branch}: commit ${sha} is not available locally. Fetch and try again.`);
  }
}

function checkStaged(config) {
  const branch = currentBranch();
  const rules = config.protectedBranches[branch];
  if (!rules) return;
  if (rules.allowMerges && mergeInProgress()) return;
  const rejected = rejectedPaths(changedPaths("--cached"), rules);
  if (rejected.length > 0) stopWithPaths(branch, rejected);
}

function checkPrePush(config, remoteName, stdin) {
  for (const { localRef, localSha, remoteRef, remoteSha } of parsePrePush(stdin)) {
    const branch = remoteRef?.startsWith(HEADS) ? remoteRef.slice(HEADS.length) : null;
    const rules = branch === null ? undefined : config.protectedBranches[branch];
    if (!rules || ZERO_SHA.test(localSha)) continue;
    if (rules.allowMerges) {
      if (localRef !== remoteRef) stop(`Push ${branch} only from the local ${branch} branch.`);
      continue;
    }
    const base = ZERO_SHA.test(remoteSha) ? `${remoteName}/${branch}` : remoteSha;
    requireCommit(base, branch);
    requireCommit(localSha, branch);
    const rejected = rejectedPaths(changedPaths(`${base}..${localSha}`), rules);
    if (rejected.length > 0) stopWithPaths(branch, [...new Set(rejected)]);
  }
}

export function checkBranch(config, [mode, remoteName = "origin"]) {
  if (mode === "--staged") checkStaged(config);
  else if (mode === "--pre-push") checkPrePush(config, remoteName, readFileSync(0, "utf8"));
  else stop("usage: dev-kit check-branch --staged | --pre-push [remote]");
}
