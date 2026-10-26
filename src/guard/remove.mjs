import { homedir } from "node:os";
import { posix } from "node:path";
import { commandName } from "./dialects.mjs";
import { isLongOption, isShortFlagCluster } from "./options.mjs";
import { stripPrefixes } from "./prefixes.mjs";
import { ALLOW, ask, deny } from "./verdict.mjs";

const DIRECTORY_CHANGERS = new Set(["cd", "pushd", "chdir", "set-location", "sl", "push-location"]);
const ANCHORED_TARGET = /^([\\/]|[A-Za-z]:|~|\$HOME|\$\{HOME\}|%USERPROFILE%|\$env:)/i;
const CHDIR_DELETE_ASK = ask(
  "A recursive delete follows a directory change in the same command, so its relative paths are judged against the wrong folder. The repo owner must confirm it.",
);

const HOME = homedir();

const WHOLE_DIRECTORY_SEGMENTS = /^[*?.]+$/;
const SENSITIVE_HOME_DIRECTORIES = [".ssh", ".aws", ".gnupg", ".config/gh", ".claude"];
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

function globFreeBase(target) {
  const expanded = expandHome(target);
  const segments = expanded.split(/[\\/]/).filter(Boolean);
  if (segments.length > 0 && segments.every((segment) => WHOLE_DIRECTORY_SEGMENTS.test(segment))) return null;
  while (segments.length > 0 && WHOLE_DIRECTORY_SEGMENTS.test(segments.at(-1)) && !/^\.\.?$/.test(segments.at(-1))) {
    segments.pop();
  }
  return `${/^[\\/]/.test(expanded) ? "/" : ""}${segments.join("/")}` || "/";
}

function targetsProtectedPath(target, context) {
  const base = globFreeBase(target);
  if (base === null) return true;
  const normalized = normalizePath(base);
  const absolute = normalized.startsWith("/") ? normalized : posix.join(normalizePath(context.cwd), normalized);
  const resolved = posix.normalize(absolute);
  return /^\/[a-z]$/.test(resolved) || protectedPaths(context.repoRoot).has(resolved);
}

function expandCmdSwitches(args) {
  return args.flatMap((argument) =>
    CMD_SWITCH_CLUSTER.test(argument) ? argument.match(CMD_SWITCH_PIECE) : [argument],
  );
}

export function removeTargets(name, rawArgs) {
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
  return { recursive, targets };
}

export function checkDeleteAfterChdir(segments) {
  let changed = false;
  for (const words of segments) {
    const [command, ...args] = stripPrefixes(words).rest;
    if (command === undefined) continue;
    const name = commandName(command);
    if (DIRECTORY_CHANGERS.has(name)) changed = true;
    else if (changed && REMOVE_COMMANDS.has(name)) {
      const { recursive, targets } = removeTargets(name, args);
      if (recursive && targets.some((target) => !ANCHORED_TARGET.test(target))) return CHDIR_DELETE_ASK;
    }
  }
  return ALLOW;
}

export function checkRemove(name, rawArgs, context) {
  const { recursive, targets } = removeTargets(name, rawArgs);
  if (!recursive) return ALLOW;
  return targets.some((target) => targetsProtectedPath(target, context))
    ? deny(
        `Blocked: recursive delete of the repository root, the home folder, a drive or one of their ancestors (${name}).`,
      )
    : ALLOW;
}
