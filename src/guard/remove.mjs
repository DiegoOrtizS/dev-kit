import { homedir } from "node:os";
import { posix } from "node:path";
import { isLongOption, isShortFlagCluster } from "./options.mjs";
import { ALLOW, deny } from "./verdict.mjs";

const HOME = homedir();

const WHOLE_DIRECTORY_SEGMENTS = new Set([".", "..", "*", ".*"]);
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

function expandHome(target) {
  return target.replace(
    /^(~|\$HOME|\$\{HOME\}|\$USERPROFILE|\$env:USERPROFILE|\$env:HOME|%USERPROFILE%)(?=[\\/]|$)/i,
    HOME,
  );
}

function targetsProtectedPath(target, context) {
  const base = expandHome(target).replace(/[\\/]\*$/, "") || "/";
  const segments = base.split(/[\\/]/).filter(Boolean);
  if (segments.length > 0 && segments.every((segment) => WHOLE_DIRECTORY_SEGMENTS.has(segment))) return true;
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

export function checkRemove(name, rawArgs, context) {
  const args = CMD_REMOVE_COMMANDS.has(name) ? expandCmdSwitches(rawArgs) : rawArgs;
  const recursive = args.some(
    (argument) =>
      isLongOption(argument, "recursive", 3) ||
      isShortFlagCluster(argument, "r") ||
      isShortFlagCluster(argument, "R") ||
      /^-r(ecurse)?$/i.test(argument) ||
      argument.toLowerCase() === "/s",
  );
  if (!recursive) return ALLOW;
  const targets = args.filter(
    (argument) => !argument.startsWith("-") && !(CMD_REMOVE_COMMANDS.has(name) && CMD_SWITCH.test(argument)),
  );
  return targets.some((target) => targetsProtectedPath(target, context))
    ? deny(
        `Blocked: recursive delete of the repository root, the home folder, a drive or one of their ancestors (${name}).`,
      )
    : ALLOW;
}
