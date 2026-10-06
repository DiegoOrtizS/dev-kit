import { execFileSync } from "node:child_process";

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tryGit(args, cwd) {
  try {
    return git(args, cwd);
  } catch {
    return null;
  }
}

function listWorktrees() {
  const blocks = git(["worktree", "list", "--porcelain"]).split("\n\n");
  return blocks.map((block) => {
    const fields = Object.fromEntries(block.split("\n").map((line) => line.split(/ (.*)/s).slice(0, 2)));
    return { path: fields.worktree, head: fields.HEAD, branch: fields.branch?.replace("refs/heads/", "") ?? null };
  });
}

function isContainedInBase(commit, base) {
  return tryGit(["merge-base", "--is-ancestor", commit, base]) !== null;
}

function hasSquashedEquivalent(branch, base) {
  const mergedPrs = tryGit(["log", base, "--format=%s", "-n", "200"]) ?? "";
  const subject = tryGit(["log", "-1", "--format=%s", branch]) ?? "";
  return subject !== "" && mergedPrs.split("\n").some((line) => line.replace(/ \(#\d+\)$/, "") === subject);
}

function removalVerdict(worktree, base) {
  const dirty = tryGit(["status", "--porcelain"], worktree.path);
  if (dirty === null) return { remove: false, reason: "cannot read status" };
  if (dirty !== "") return { remove: false, reason: "uncommitted changes" };
  if (isContainedInBase(worktree.head, base)) return { remove: true, reason: `commit already in ${base}` };
  if (worktree.branch && hasSquashedEquivalent(worktree.branch, base))
    return { remove: true, reason: `squash-merged into ${base}` };
  return { remove: false, reason: `has commits not in ${base}` };
}

function report(line) {
  process.stdout.write(`${line}\n`);
}

export function worktreesClean(config, args) {
  const apply = args.includes("--apply");
  const base = config.worktrees.base;
  const protectedBranches = new Set(Object.keys(config.protectedBranches));
  tryGit(["fetch", "--prune", "origin"]);
  const [primary, ...linked] = listWorktrees();
  const current = git(["rev-parse", "--show-toplevel"]).replaceAll("\\", "/");

  for (const worktree of linked) {
    const label = `${worktree.branch ?? "detached"} (${worktree.path})`;
    if (worktree.path.replaceAll("\\", "/") === current) {
      report(`keep   ${label}: current session`);
      continue;
    }
    const verdict = removalVerdict(worktree, base);
    if (!verdict.remove) {
      report(`keep   ${label}: ${verdict.reason}`);
      continue;
    }
    report(`${apply ? "remove" : "would remove"} ${label}: ${verdict.reason}`);
    if (apply) git(["worktree", "remove", worktree.path], primary.path);
  }

  const merged = (tryGit(["branch", "--format=%(refname:short)"]) ?? "").split("\n").filter(Boolean);
  const checkedOut = new Set(listWorktrees().map((worktree) => worktree.branch));
  for (const branch of merged) {
    if (protectedBranches.has(branch) || checkedOut.has(branch)) continue;
    const tip = tryGit(["rev-parse", branch]);
    if (!tip || !(isContainedInBase(tip, base) || hasSquashedEquivalent(branch, base))) continue;
    report(`${apply ? "delete" : "would delete"} branch ${branch}: merged`);
    if (apply) git(["branch", "-D", branch]);
  }

  if (!apply) report("dry run; pass --apply to remove");
}
