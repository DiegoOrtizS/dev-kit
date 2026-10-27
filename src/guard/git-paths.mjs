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
  rm: new Set(["--pathspec-from-file"]),
  mv: new Set(),
};
const WHOLE_TREE_REWRITERS = new Set(["checkout", "restore"]);
const WHOLE_TREE = deny(
  "Blocked: checking out or restoring the whole tree discards work in the shared tree, like git reset --hard; ask the repo owner.",
);
const WHOLE_TREE_ASK = ask(
  "This touches every tracked file (an all-exclude pathspec matches the whole tree), the agent's limits and the git hooks among them. The repo owner must confirm it.",
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

function pathspecTokens(subcommand, rest) {
  const separator = rest.indexOf("--");
  if (separator !== -1) return rest.slice(separator + 1);
  const { positionals } = parseArguments(rest, VALUED[subcommand]);
  if (subcommand === "checkout" && positionals.length > 0 && !positionals[0].startsWith(":")) {
    return positionals.slice(1);
  }
  return positionals;
}

export function checkGitPaths(subcommand, rest, context) {
  const valued = VALUED[subcommand];
  if (valued === undefined) return ALLOW;
  const { values, flags, positionals } = parseArguments(rest, valued);
  if (values["--pathspec-from-file"] !== undefined) return UNREADABLE_PATHSPEC;
  if (subcommand === "restore" && isStagedOnly(flags)) return ALLOW;
  if (subcommand === "rm" && flags.some((flag) => isLongOption(flag, "cached", 2))) return ALLOW;
  const specs = pathspecTokens(subcommand, rest);
  if (specs.length > 0 && specs.every((spec) => EXCLUDE_MAGIC.test(spec))) {
    return WHOLE_TREE_REWRITERS.has(subcommand) ? WHOLE_TREE : WHOLE_TREE_ASK;
  }
  const paths = positionals.filter((spec) => !EXCLUDE_MAGIC.test(spec)).map((spec) => pathspecPath(spec, context));
  if (WHOLE_TREE_REWRITERS.has(subcommand) && paths.some((path) => relativeToRepo(path, context) === "")) {
    return WHOLE_TREE;
  }
  return firstBlock(paths.map((path) => checkPathspec(path, context)));
}
