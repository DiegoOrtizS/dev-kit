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

function listWorktrees(cwd) {
  const blocks = git(["worktree", "list", "--porcelain"], cwd).split("\n\n");
  return blocks.map((block) => {
    const fields = Object.fromEntries(block.split("\n").map((line) => line.split(/ (.*)/s).slice(0, 2)));
    return { path: fields.worktree, head: fields.HEAD, branch: fields.branch?.replace("refs/heads/", "") ?? null };
  });
}

export function mergedInto(commit, base, cwd) {
  if (tryGit(["merge-base", "--is-ancestor", commit, base], cwd) !== null) return `commit already in ${base}`;
  const mergedTree = tryGit(["merge-tree", "--write-tree", base, commit], cwd);
  const baseTree = tryGit(["rev-parse", `${base}^{tree}`], cwd);
  if (mergedTree !== null && mergedTree === baseTree) return `changes already in ${base}`;
  return null;
}

function removalVerdict(worktree, base) {
  const dirty = tryGit(["status", "--porcelain"], worktree.path);
  if (dirty === null) return { remove: false, reason: "cannot read status" };
  if (dirty !== "") return { remove: false, reason: "uncommitted changes" };
  const merged = mergedInto(worktree.head, base, worktree.path);
  if (merged) return { remove: true, reason: merged };
  return { remove: false, reason: `has changes not in ${base}` };
}

export function worktreesClean(config, args, repoRoot = process.cwd()) {
  const lines = [];
  const report = (line) => {
    lines.push(line);
    process.stdout.write(`${line}\n`);
  };
  const apply = args.includes("--apply");
  const base = config.worktrees.base;
  const protectedBranches = new Set(Object.keys(config.protectedBranches));
  tryGit(["fetch", "--prune", "origin"], repoRoot);
  const [primary, ...linked] = listWorktrees(repoRoot);
  const current = git(["rev-parse", "--show-toplevel"], repoRoot).replaceAll("\\", "/");

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

  const branches = (tryGit(["branch", "--format=%(refname:lstrip=2)"], repoRoot) ?? "").split("\n").filter(Boolean);
  const checkedOut = new Set(listWorktrees(repoRoot).map((worktree) => worktree.branch));
  for (const branch of branches) {
    if (protectedBranches.has(branch) || checkedOut.has(branch)) continue;
    const tip = tryGit(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], repoRoot);
    const merged = tip && mergedInto(tip, base, repoRoot);
    if (!merged) continue;
    report(`${apply ? "delete" : "would delete"} branch ${branch}: ${merged}`);
    if (apply) git(["branch", "-D", branch], repoRoot);
  }

  if (!apply) report("dry run; pass --apply to remove");
  return lines;
}
