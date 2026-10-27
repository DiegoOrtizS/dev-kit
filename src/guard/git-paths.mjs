import { posix } from "node:path";
import {
  OWN_LIMITS_ASK,
  OWN_LIMITS_SAMPLES,
  checkWrittenPaths,
  coversOwnLimits,
  relativeToRepo,
} from "./env-files.mjs";
import { globRegExp, hasGlob } from "./globs.mjs";
import { isLongOption, isShortFlagCluster, parseArguments } from "./options.mjs";
import { ALLOW, ask, deny, firstBlock } from "./verdict.mjs";

const VALUED = {
  checkout: new Set(["-b", "-B", "--orphan", "--conflict", "--pathspec-from-file"]),
  restore: new Set(["-s", "--source", "--conflict", "--pathspec-from-file"]),
};
const WHOLE_TREE_REWRITERS = new Set(["checkout", "restore"]);
const WHOLE_TREE = deny(
  "Blocked: checking out or restoring the whole tree discards work in the shared tree, like git reset --hard; ask the repo owner.",
);
const UNREADABLE_PATHSPEC = ask(
  "This git command takes its paths from a file, and the guard cannot read whether they include the agent's limits or the git hooks. The repo owner must confirm it.",
);
const EXCLUDE_MAGIC = /^:(!|\^|\([^)]*exclude[^)]*\))/;
const MAGIC = /^:(\/|\(([^)]*)\))?/;

function pathspecPath(spec, context) {
  const magic = MAGIC.exec(spec);
  if (magic === null) return spec;
  const rest = spec.slice(magic[0].length);
  const fromTop = magic[1] === "/" || /(^|,)top(,|$)/.test(magic[2] ?? "");
  return fromTop ? posix.join(context.repoRoot, rest || ".") : rest;
}

function isStagedOnly(flags) {
  const staged = flags.some((flag) => isLongOption(flag, "staged", 3) || isShortFlagCluster(flag, "S"));
  const worktree = flags.some((flag) => isLongOption(flag, "worktree", 3) || isShortFlagCluster(flag, "W"));
  return staged && !worktree;
}

function checkPathspec(path, context) {
  if (hasGlob(path)) {
    const fromRoot = relativeToRepo(path, context);
    const pattern = fromRoot === null ? null : globRegExp(fromRoot, { crossSlash: true });
    return pattern !== null && OWN_LIMITS_SAMPLES.some((sample) => pattern.test(sample)) ? OWN_LIMITS_ASK : ALLOW;
  }
  const written = checkWrittenPaths([path], context);
  if (written.block || written.ask) return written;
  return coversOwnLimits(path, context) ? OWN_LIMITS_ASK : ALLOW;
}

export function checkGitPaths(subcommand, rest, context) {
  const valued = VALUED[subcommand];
  if (valued === undefined) return ALLOW;
  const { values, flags, positionals } = parseArguments(rest, valued);
  if (values["--pathspec-from-file"] !== undefined) return UNREADABLE_PATHSPEC;
  if (subcommand === "restore" && isStagedOnly(flags)) return ALLOW;
  const paths = positionals.filter((spec) => !EXCLUDE_MAGIC.test(spec)).map((spec) => pathspecPath(spec, context));
  if (WHOLE_TREE_REWRITERS.has(subcommand) && paths.some((path) => relativeToRepo(path, context) === "")) {
    return WHOLE_TREE;
  }
  return firstBlock(paths.map((path) => checkPathspec(path, context)));
}
