import { homedir } from "node:os";
import { posix } from "node:path";
import { BASH, POWERSHELL, commandName } from "./dialects.mjs";
import { expandBraces, globMatch, hasGlob, isWholeDirectorySegment, normalizeGlobs } from "./globs.mjs";
import { isLongOption, isShortFlagCluster } from "./options.mjs";
import { stripPrefixes } from "./prefixes.mjs";
import { PS_REMOVERS, powershellRemoveTargets } from "./ps-remove.mjs";
import { ALLOW, ask, deny } from "./verdict.mjs";

export const DIRECTORY_CHANGERS = new Set(["cd", "pushd", "chdir", "set-location", "sl", "push-location"]);
const ANCHORED_TARGET = /^([\\/]|[A-Za-z]:|~|\$HOME|\$\{HOME\}|%USERPROFILE%|\$env:)/i;
const CHDIR_DELETE_ASK = ask(
  "A recursive delete follows a directory change in the same command, so its relative paths are judged against the wrong folder. The repo owner must confirm it.",
);

const HOME = homedir();
const HOME_PARENT = posix.dirname(HOME.replace(/\\/g, "/"));

const SENSITIVE_HOME_DIRECTORIES = [".ssh", ".aws", ".gnupg", ".config", ".config/gh", ".claude"];
const USER_HOME = /^~([A-Za-z_][\w.-]*)(?=[\\/]|$)/;
const WORKING_DIRECTORY = /^(\$PWD|\$\{PWD\}|~\+|\$\(\s*(pwd|get-location|gl)\s*\)|`\s*pwd\s*`)(?=[\\/]|$)/i;
const TOPLEVEL =
  /^(\$\(\s*git\s+rev-parse\s+--show-toplevel\s*\)|`\s*git\s+rev-parse\s+--show-toplevel\s*`)(?=[\\/]|$)/;
const EXTENDED_PREFIX = /^(?:\\\\|\/\/)[?.][\\/]/;
const CYGDRIVE = /^(?:\/proc)?\/cygdrive\/([A-Za-z])(?=[\\/]|$)|^\/mnt\/([A-Za-z])(?=[\\/]|$)/;
const UNRESOLVED_TARGET = /[$`]|%[^%\s]+%|^~-(?=[\\/]|$)/;
export const REMOVE_COMMANDS = new Set(["rm", "remove-item", "ri", "rd", "rmdir", "del", "erase"]);
const CMD_REMOVE_COMMANDS = new Set(["rd", "rmdir", "del", "erase"]);
const CMD_SWITCH = /^\/[a-z?](:.*)?$/i;

const CMD_SWITCH_CLUSTER = /^(?:\/[a-z?](?::[^/]*)?)+$/i;
const CMD_SWITCH_PIECE = /\/[a-z?](?::[^/]*)?/gi;

function normalizePath(path) {
  const forward = path.replace(/\\/g, "/").replace(/^([A-Za-z]):(?=\/|$)/, (_, drive) => `/${drive}`);
  const normalized = posix.normalize(forward === "" ? "." : forward).replace(/(.)\/+$/, "$1");
  return normalized.toLowerCase();
}

function withAncestors(path) {
  const paths = [];
  for (let current = normalizePath(path); ; current = posix.dirname(current)) {
    paths.push(current);
    if (current === "/" || current === ".") return paths;
  }
}

function protectedPaths(repoRoot) {
  const home = normalizePath(HOME);
  const root = normalizePath(repoRoot);
  return new Set([
    "/",
    ...withAncestors(repoRoot),
    ...withAncestors(HOME),
    `${root}/.git`,
    ...SENSITIVE_HOME_DIRECTORIES.map((directory) => `${home}/${directory}`),
  ]);
}

export function expandHome(target) {
  return target.replace(
    /^(~|\$HOME|\$\{HOME\}|\$USERPROFILE|\$env:USERPROFILE|\$env:HOME|%USERPROFILE%)(?=[\\/]|$)/i,
    HOME,
  );
}

function resolveTarget(target, context) {
  const prefixed = target.replace(EXTENDED_PREFIX, "").replace(CYGDRIVE, (_, a, b) => `/${a ?? b}`);
  const cleaned = context.soleTopLevel ? prefixed.replace(TOPLEVEL, context.repoRoot.replace(/\\/g, "/")) : prefixed;
  const user = USER_HOME.exec(cleaned);
  if (user !== null) return `${HOME_PARENT}/${user[1]}${cleaned.slice(user[0].length)}`;
  return expandHome(cleaned).replace(WORKING_DIRECTORY, context.cwd);
}

function globFreeBase(target) {
  const segments = target.split(/[\\/]/).filter(Boolean);
  if (segments.length > 0 && segments.every(isWholeDirectorySegment)) return null;
  while (segments.length > 0 && isWholeDirectorySegment(segments.at(-1)) && !/^\.\.?$/.test(segments.at(-1))) {
    segments.pop();
  }
  return `${/^[\\/]/.test(target) ? "/" : ""}${segments.join("/")}` || "/";
}

function absolutePath(path, context) {
  const normalized = normalizePath(path);
  return posix.normalize(normalized.startsWith("/") ? normalized : posix.join(normalizePath(context.cwd), normalized));
}

function targetsProtectedPath(target, context) {
  const protectedSet = protectedPaths(context.repoRoot);
  const normalized = normalizeGlobs(target);
  const base = globFreeBase(normalized);
  if (base === null) return true;
  const resolved = absolutePath(base, context);
  if (/^\/[a-z]$/.test(resolved) || protectedSet.has(resolved)) return true;
  if (!hasGlob(normalized)) return false;
  const pattern = absolutePath(normalized, context);
  return [...protectedSet].some((path) => globMatch(pattern, path));
}

function expandCmdSwitches(args) {
  return args.flatMap((argument) =>
    CMD_SWITCH_CLUSTER.test(argument) ? argument.match(CMD_SWITCH_PIECE) : [argument],
  );
}

export function removeTargets(name, rawArgs, dialect = BASH) {
  if (dialect === POWERSHELL && PS_REMOVERS.has(name)) return powershellRemoveTargets(rawArgs);
  const args = CMD_REMOVE_COMMANDS.has(name) ? expandCmdSwitches(rawArgs) : rawArgs;
  const recursive = args.some(
    (argument) =>
      isLongOption(argument, "recursive", 3) ||
      isShortFlagCluster(argument, "r") ||
      isShortFlagCluster(argument, "R") ||
      /^-r(ecurse)?$/i.test(argument) ||
      argument.toLowerCase() === "/s",
  );
  const targets = args.filter(
    (argument) => !argument.startsWith("-") && !(CMD_REMOVE_COMMANDS.has(name) && CMD_SWITCH.test(argument)),
  );
  return { recursive, targets, unreadable: false };
}

export function checkDeleteAfterChdir(segments, dialect = BASH) {
  let changed = false;
  for (const words of segments) {
    const [command, ...args] = stripPrefixes(words).rest;
    if (command === undefined) continue;
    const name = commandName(command);
    if (DIRECTORY_CHANGERS.has(name)) changed = true;
    else if (changed && REMOVE_COMMANDS.has(name)) {
      const { recursive, targets } = removeTargets(name, args, dialect);
      if (recursive && targets.some((target) => !ANCHORED_TARGET.test(target))) return CHDIR_DELETE_ASK;
    }
  }
  return ALLOW;
}

export function checkRemove(name, rawArgs, context, dialect = BASH) {
  const { recursive, targets, unreadable } = removeTargets(name, rawArgs, dialect);
  if (!recursive) return ALLOW;
  const resolved = targets.flatMap((target) => expandBraces(target).map((alt) => resolveTarget(alt, context)));
  if (unreadable || resolved.some((target) => UNRESOLVED_TARGET.test(target))) {
    return deny(
      `Blocked: ${name} would delete recursively a path built from a variable, a list or a substitution, and the guard cannot read it. Name the path instead.`,
    );
  }
  return resolved.some((target) => targetsProtectedPath(target, context))
    ? deny(
        `Blocked: recursive delete of the repository root, the home folder, a drive or one of their ancestors (${name}).`,
      )
    : ALLOW;
}
