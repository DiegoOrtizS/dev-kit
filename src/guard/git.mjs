import { gitInvocation, isGitConfigRead, parseGitConfig, parsePush, splitOptionsAndPositionals } from "./git-args.mjs";
import { isLongOption, isShortFlagCluster } from "./options.mjs";
import { ALLOW, deny } from "./verdict.mjs";

const HOOK_DISABLING_ASSIGNMENT = [
  /^LEFTHOOK=(0|false)$/i,
  /^LEFTHOOK_EXCLUDE=/i,
  /^GIT_CONFIG_(PARAMETERS|COUNT|GLOBAL|SYSTEM)=/i,
  /^GIT_CONFIG_(KEY|VALUE)_\d+=/i,
];
const HOOKS_PATH_CONFIG = /^core\.hookspath(=|$)/i;
const REMOTE_PUSH_CONFIG = /^remote\.[^=]*\.push(=|$)/i;

export function checkAssignments(assignments) {
  const disabling = assignments.find((assignment) =>
    HOOK_DISABLING_ASSIGNMENT.some((pattern) => pattern.test(assignment)),
  );
  return disabling ? deny(`Blocked: ${disabling.split("=")[0]} would disable or redirect the git hooks.`) : ALLOW;
}

function pushDestination(refspec) {
  const destination = refspec.replace(/^\+/, "").split(":").pop() ?? "";
  return destination.replace(/^(refs\/)?heads\//, "");
}

function pushBlockedBranches(context) {
  return Object.entries(context.config.protectedBranches)
    .filter(([, rules]) => rules.blockAgentPush)
    .map(([name]) => name);
}

function checkGitPush(rest, context) {
  const { options, refspecs } = parsePush(rest);
  const forcing = options.some(
    (option) =>
      isLongOption(option, "force") ||
      isLongOption(option, "force-with-lease") ||
      isLongOption(option, "force-if-includes") ||
      isShortFlagCluster(option, "f"),
  );
  if (forcing) return deny("Blocked: force push is not allowed. Use a normal push on a work branch.");
  if (options.some((option) => isLongOption(option, "mirror") || isLongOption(option, "all"))) {
    return deny("Blocked: git push --all/--mirror pushes every branch, protected ones included.");
  }
  if (refspecs.some((refspec) => refspec.startsWith("+"))) return deny("Blocked: a +refspec is a force push.");
  const blockedBranches = pushBlockedBranches(context);
  const target = refspecs.map(pushDestination).find((branch) => blockedBranches.includes(branch));
  if (target !== undefined) {
    const deleting = options.some((option) => isLongOption(option, "delete"));
    return deny(
      deleting
        ? `Blocked: deleting ${target} on the remote is not allowed.`
        : `Blocked: pushing straight to ${target} is not allowed. Open a pull request from a work branch.`,
    );
  }
  return ALLOW;
}

export function checkGit(args, context) {
  const { configEntries, subcommand, rest } = gitInvocation(args);
  if (configEntries.some((entry) => HOOKS_PATH_CONFIG.test(entry))) {
    return deny("Blocked: changing core.hooksPath skips the git hooks.");
  }
  if (configEntries.some((entry) => REMOTE_PUSH_CONFIG.test(entry))) {
    return deny("Blocked: changing remote.*.push can redirect a push to a protected branch.");
  }
  if (!subcommand) return ALLOW;
  if (subcommand === "push") {
    const verdict = checkGitPush(rest, context);
    if (verdict.block) return verdict;
  }
  const { options } = splitOptionsAndPositionals(rest);
  if (options.some((option) => isLongOption(option, "no-verify", 4))) {
    return deny(`Blocked: git ${subcommand} --no-verify skips the git hooks.`);
  }
  if (subcommand === "config") {
    if (!isGitConfigRead(parseGitConfig(rest)) && rest.some((argument) => HOOKS_PATH_CONFIG.test(argument))) {
      return deny("Blocked: changing core.hooksPath skips the git hooks.");
    }
  }
  if (subcommand === "commit" && options.some((option) => isShortFlagCluster(option, "n"))) {
    return deny("Blocked: git commit -n skips the git hooks.");
  }
  if (subcommand === "reset" && options.some((option) => isLongOption(option, "hard", 2))) {
    return deny("Blocked: git reset --hard discards work in the shared tree; ask the repo owner.");
  }
  if (
    subcommand === "clean" &&
    options.some((option) => isLongOption(option, "force") || isShortFlagCluster(option, "f"))
  ) {
    return deny("Blocked: git clean -f deletes files in the shared tree; ask the repo owner.");
  }
  return ALLOW;
}
