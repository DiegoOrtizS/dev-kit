import { gitInvocation } from "./git-args.mjs";
import { splitSegments } from "./segments.mjs";
import { ask } from "./verdict.mjs";

const NEVER_ALIASED = new Set(
  `add am annotate apply archive bisect blame branch bugreport bundle cat-file check-attr check-ignore check-mailmap
  check-ref-format checkout checkout-index cherry cherry-pick clean clone column commit commit-graph commit-tree config
  count-objects credential credential-cache credential-store describe diff diff-files diff-index diff-tree difftool
  fast-export fast-import fetch fetch-pack filter-branch fmt-merge-msg for-each-ref format-patch fsck fsck-objects gc
  get-tar-commit-id grep hash-object help index-pack init init-db interpret-trailers log ls-files ls-remote ls-tree
  mailinfo mailsplit maintenance merge merge-base merge-file merge-index merge-ours merge-recursive merge-subtree
  merge-tree mergetool mktag mktree multi-pack-index mv name-rev notes pack-objects pack-redundant pack-refs patch-id
  prune prune-packed pull push range-diff read-tree rebase receive-pack reflog remote repack replace request-pull rerere
  reset restore rev-list rev-parse revert rm send-pack shortlog show show-branch show-index show-ref sparse-checkout stage
  stash status stripspace submodule switch symbolic-ref tag unpack-file unpack-objects update-index update-ref
  update-server-info upload-archive upload-pack var verify-commit verify-pack verify-tag version whatchanged worktree
  write-tree`.split(/\s+/),
);
const LOOKUP_OPTIONS = new Set(["-C", "--git-dir", "--work-tree"]);
const UNRESOLVED_ALIAS = ask(
  "git could not tell whether this subcommand is an alias, so the guard cannot read what it runs. The repo owner must confirm it.",
);
export const SHELL_ALIAS_WITH_ARGUMENTS = ask(
  "This git alias runs a shell command that uses its arguments or variables, and the guard cannot read the result. The repo owner must confirm it.",
);

function lookupArguments(prefix) {
  const kept = [];
  for (let index = 0; index < prefix.length; index += 1) {
    if (LOOKUP_OPTIONS.has(prefix[index])) kept.push(prefix[index], prefix[(index += 1)] ?? "");
    else if (/^--(git-dir|work-tree)=/.test(prefix[index])) kept.push(prefix[index]);
  }
  return kept;
}

export function expandGitAlias(args, context) {
  const { subcommand, rest } = gitInvocation(args);
  if (subcommand === undefined || NEVER_ALIASED.has(subcommand)) return null;
  const prefix = args.slice(0, args.length - rest.length - 1);
  const gitArgs = lookupArguments(prefix);
  const seen = new Set();
  let name = subcommand;
  let words = rest;
  while (!NEVER_ALIASED.has(name)) {
    if (seen.has(name.toLowerCase())) return null;
    seen.add(name.toLowerCase());
    let expansion;
    try {
      expansion = context.io.gitAlias(name, { cwd: context.cwd, gitArgs });
    } catch {
      return { verdict: UNRESOLVED_ALIAS };
    }
    if (expansion === null) break;
    if (expansion.startsWith("!")) {
      const script = [expansion.slice(1), ...words].join(" ");
      return { script, dynamic: /[$`]/.test(expansion) };
    }
    const [first, ...more] = splitSegments(expansion).segments.flat();
    if (first === undefined) return null;
    name = first;
    words = [...more, ...words];
  }
  return name === subcommand && words === rest ? null : { args: [...prefix, name, ...words] };
}
