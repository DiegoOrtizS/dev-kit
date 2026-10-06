import { basename, isAbsolute, relative, resolve } from "node:path";
import { ALLOW, deny } from "./verdict.mjs";

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
const FILE_MOVERS = new Set(["cp", "mv"]);
const ENV_FILE = /^\.env(\..+)?$/;
const ENV_ALLOWED = /^\.env\.(.+\.)?example$|^\.env\.test$/;

function cleanArgument(argument) {
  return argument.replace(/^</, "").replace(/\\/g, "/");
}

function isProtectedEnvFile(argument) {
  const name = basename(cleanArgument(argument));
  return ENV_FILE.test(name) && !ENV_ALLOWED.test(name);
}

export function repoRelativePath(path, context) {
  const absolute = isAbsolute(path) ? path : resolve(context.cwd, path);
  const fromRoot = relative(context.repoRoot, absolute).replace(/\\/g, "/");
  return fromRoot === "" || fromRoot.startsWith("..") || isAbsolute(fromRoot) ? null : fromRoot;
}

export function matchesBlockedPath(path, patterns, context) {
  if (patterns.length === 0) return false;
  const fromRoot = repoRelativePath(cleanArgument(path), context);
  return fromRoot !== null && patterns.some((pattern) => pattern.test(fromRoot) || pattern.test(`${fromRoot}/`));
}

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
  return ALLOW;
}
