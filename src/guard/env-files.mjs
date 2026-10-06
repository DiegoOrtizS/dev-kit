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
const FILE_MOVERS = new Set(["cp", "mv", "copy-item", "move-item", "cpi", "mi"]);
const ENV_FILE = /^\.env(\..+)?$/;
const ENV_ALLOWED = /^\.env\.(.+\.)?example$|^\.env\.test$/;
const OWN_LIMITS = [/^\.claude\/settings(\.local)?\.json$/i, /^\.claude\/guard\.json$/i, /^tools\/claude-hooks\//i];
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

export function repoRelativePath(path, context) {
  const target = comparable(expandHome(cleanArgument(path)));
  const absolute = target.startsWith("/") ? target : posix.join(comparable(context.cwd), target);
  const fromRoot = posix.relative(comparable(context.repoRoot), absolute);
  return fromRoot === "" || fromRoot.startsWith("..") ? null : fromRoot;
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

export const OWN_LIMITS_ASK = ask(
  "This changes the agent's own limits (.claude/settings.json, .claude/guard.json or tools/claude-hooks/). The repo owner must approve it.",
);

function inspectedArguments(name, args) {
  const positionals = args.filter((argument) => !argument.startsWith("-"));
  if (FILE_MOVERS.has(name)) return { read: positionals.slice(0, -1), written: positionals.slice(-1) };
  return { read: FILE_READERS.has(name) ? args : [], written: [] };
}

export function checkFileAccess(name, args, context) {
  const { read, written } = inspectedArguments(name, args);
  if (read.some(isProtectedEnvFile)) return deny("Blocked: reading .env files exposes secrets.");
  const { blockedPaths } = context.config;
  if (read.some((argument) => matchesBlockedPath(argument, blockedPaths.read, context))) {
    return deny("Blocked: this path is off limits for reading in this repository (.claude/guard.json).");
  }
  if (written.some((argument) => matchesBlockedPath(argument, blockedPaths.write, context))) {
    return deny("Blocked: this path is off limits for writing in this repository (.claude/guard.json).");
  }
  if (written.some((argument) => touchesOwnLimits(argument, context))) return OWN_LIMITS_ASK;
  return ALLOW;
}
