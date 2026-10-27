import { basename, posix } from "node:path";
import { expandHome } from "./remove.mjs";
import { ALLOW, ask, deny } from "./verdict.mjs";

const FILE_READERS = new Set([
  "cat",
  "less",
  "more",
  "type",
  "head",
  "tail",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "sed",
  "awk",
  "gawk",
  "nl",
  "bat",
  "base64",
  "xxd",
  "source",
  ".",
  "get-content",
  "gc",
  "select-string",
  "sls",
]);
const FILE_MOVERS = new Set(["cp", "mv", "ln", "install", "copy-item", "move-item", "cpi", "mi"]);
const IN_PLACE_FLAGS = {
  sed: /^-[A-Za-z]*i|^--in-place/,
  perl: /^-[A-Za-z]*i/,
  awk: /^-i$|^--in-?place/,
  gawk: /^-i$|^--in-?place/,
  patch: /^/,
};
const FILE_WRITERS = new Set([
  "tee",
  "truncate",
  "chmod",
  "chattr",
  "rm",
  "set-content",
  "sc",
  "add-content",
  "ac",
  "out-file",
  "new-item",
  "ni",
  "remove-item",
  "ri",
  "del",
  "erase",
  "rd",
  "rmdir",
]);
const GIT_HOOK_FILES =
  /(^|\/)(\.git(\/hooks(\/|$)|\/config(\.worktree)?$|\/worktrees\/[^/]+\/config(\.worktree)?$|$)|\.gitconfig$|\.config\/git(\/|$)|lefthook-local\.ya?ml$)/i;
const ENV_FILE = /^\.env(\..+)?$/;
const ENV_ALLOWED = /^\.env\.(.+\.)?example$|^\.env\.test$/;
const OWN_LIMITS = [/^\.claude\/settings(\.local)?\.json$/i, /^\.claude\/guard\.json$/i, /^tools\/claude-hooks\//i];
const OWN_LIMITS_DIRECTORIES = [/^\.claude$/i, /^tools$/i];
export const OWN_LIMITS_SAMPLES = [
  ".claude/settings.json",
  ".claude/settings.local.json",
  ".claude/guard.json",
  "tools/claude-hooks/guard.mjs",
  "tools/claude-hooks/lint-after-edit.mjs",
];
const WINDOWS = process.platform === "win32";

function cleanArgument(argument) {
  return argument.replace(/^</, "").replace(/\\/g, "/");
}

function isProtectedEnvFile(argument) {
  const name = basename(cleanArgument(argument));
  return ENV_FILE.test(name) && !ENV_ALLOWED.test(name);
}

function comparable(path) {
  const forward = path.replace(/\\/g, "/").replace(/^([A-Za-z]):(?=\/|$)/, (_, drive) => `/${drive.toLowerCase()}`);
  const normalized = posix.normalize(forward === "" ? "." : forward);
  return WINDOWS ? normalized.toLowerCase() : normalized;
}

export function relativeToRepo(path, context) {
  const target = comparable(expandHome(cleanArgument(path)));
  const absolute = target.startsWith("/") ? target : posix.join(comparable(context.cwd), target);
  const fromRoot = posix.relative(comparable(context.repoRoot), absolute);
  return fromRoot.startsWith("..") ? null : fromRoot;
}

export function repoRelativePath(path, context) {
  const fromRoot = relativeToRepo(path, context);
  return fromRoot === "" ? null : fromRoot;
}

export function coversOwnLimits(path, context) {
  const fromRoot = relativeToRepo(path, context);
  if (fromRoot === null) return false;
  return fromRoot === "" || touchesOwnLimits(path, context) || OWN_LIMITS_DIRECTORIES.some((dir) => dir.test(fromRoot));
}

function matchesAny(fromRoot, patterns) {
  return patterns.some((pattern) => pattern.test(fromRoot) || pattern.test(`${fromRoot}/`));
}

export function matchesBlockedPath(path, patterns, context) {
  if (patterns.length === 0) return false;
  const fromRoot = repoRelativePath(path, context);
  return fromRoot !== null && matchesAny(fromRoot, patterns);
}

export function touchesOwnLimits(path, context) {
  return matchesBlockedPath(path, OWN_LIMITS, context);
}

export function touchesGitHooks(path) {
  return GIT_HOOK_FILES.test(cleanArgument(expandHome(path)).replace(/(.)\/+$/, "$1"));
}

export const OWN_LIMITS_ASK = ask(
  "This changes the agent's own limits (.claude/settings.json, .claude/guard.json or tools/claude-hooks/). The repo owner must approve it.",
);
export const GIT_HOOKS_ASK = ask(
  "This edits the git hooks or git config directly (.git/hooks, .git/config, the .git file, ~/.gitconfig, ~/.config/git or lefthook-local.yml). The repo owner must approve it.",
);

export function isFileCommand(name) {
  return FILE_READERS.has(name) || FILE_MOVERS.has(name) || FILE_WRITERS.has(name);
}

function editsInPlace(name, args) {
  const flag = IN_PLACE_FLAGS[name];
  return flag !== undefined && args.some((argument) => flag.test(argument));
}

function inspectedArguments(name, args) {
  const positionals = args.filter((argument) => !argument.startsWith("-"));
  const read = FILE_READERS.has(name) ? args : [];
  if (FILE_MOVERS.has(name)) return { read: positionals.slice(0, -1), written: positionals.slice(-1) };
  if (FILE_WRITERS.has(name) || editsInPlace(name, args)) return { read, written: positionals };
  if (name === "dd") return { read, written: args.filter((argument) => /^of=/.test(argument)).map((a) => a.slice(3)) };
  return { read, written: [] };
}

export function checkWrittenPaths(written, context) {
  if (written.some((argument) => matchesBlockedPath(argument, context.config.blockedPaths.write, context))) {
    return deny("Blocked: this path is off limits for writing in this repository (.claude/guard.json).");
  }
  if (written.some((argument) => touchesOwnLimits(argument, context))) return OWN_LIMITS_ASK;
  if (written.some(touchesGitHooks)) return GIT_HOOKS_ASK;
  return ALLOW;
}

export function checkFileAccess(name, args, context) {
  const { read, written } = inspectedArguments(name, args);
  if (read.some(isProtectedEnvFile)) return deny("Blocked: reading .env files exposes secrets.");
  if (read.some((argument) => matchesBlockedPath(argument, context.config.blockedPaths.read, context))) {
    return deny("Blocked: this path is off limits for reading in this repository (.claude/guard.json).");
  }
  return checkWrittenPaths(written, context);
}
