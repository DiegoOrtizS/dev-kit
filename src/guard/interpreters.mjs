import { POWERSHELL } from "./dialects.mjs";
import { ALLOW, ask } from "./verdict.mjs";

const INLINE_FLAGS = {
  node: /^(-e|--eval|-p|--print)$/,
  nodejs: /^(-e|--eval|-p|--print)$/,
  python: /^-c$/,
  python3: /^-c$/,
  py: /^-c$/,
  perl: /^-[A-Za-z]*[eE]$/,
  ruby: /^-e$/,
  php: /^-r$/,
};
export const INTERPRETERS = new Set(Object.keys(INLINE_FLAGS));
const ATTACHED_INLINE = /^--(eval|print)=/;
const SPAWNS_OR_DELETES =
  /child_process|execSync|spawn|system\(|subprocess|os\.remove|os\.system|popen|rmSync|unlink|rmdir|shutil/i;

const PROTECTED_PATH =
  /\.claude[\\/]+(settings(\.local)?|guard)\.json|claude-hooks|\.git[\\/]+(hooks|config)|\.gitconfig|lefthook-local/i;
const WRITE_CALL = /write|append|rename|copy|link|truncate|chmod|replace|open\s*\(/i;
const DOT_NET_FILE_CALL = /\[(?:System\.)?IO\.(?:File|Directory)\]::(\w+)/gi;
const DOT_NET_REMOVERS = /^(Delete|Move)$/i;
const DOT_NET_WRITERS = /^(Write|Append|Copy|Replace|Create|Open|Set)/i;

const INLINE_CODE_ASK = ask(
  "This inline script spawns processes or deletes files, and the guard cannot check what it runs. The repo owner must approve it.",
);
const INLINE_PROTECTED_WRITE_ASK = ask(
  "This inline script writes to the agent's limits or the git hooks (.claude/settings.json, .claude/guard.json, tools/claude-hooks/, .git/hooks, git config). The repo owner must approve it.",
);

function inlineCode(flag, args) {
  return args.flatMap((argument, index) => {
    if (ATTACHED_INLINE.test(argument)) return [argument.slice(argument.indexOf("=") + 1)];
    return flag.test(argument) && args[index + 1] !== undefined ? [args[index + 1]] : [];
  });
}

function writesProtectedPath(code) {
  return PROTECTED_PATH.test(code) && WRITE_CALL.test(code);
}

export function checkInlineCode(name, args) {
  const flag = INLINE_FLAGS[name];
  if (flag === undefined) return ALLOW;
  const codes = inlineCode(flag, args);
  if (codes.some((code) => SPAWNS_OR_DELETES.test(code))) return INLINE_CODE_ASK;
  return codes.some(writesProtectedPath) ? INLINE_PROTECTED_WRITE_ASK : ALLOW;
}

export function checkDotNetFileCalls(script, dialect) {
  if (dialect !== POWERSHELL) return ALLOW;
  const methods = [...script.matchAll(DOT_NET_FILE_CALL)].map(([, method]) => method);
  if (methods.some((method) => DOT_NET_REMOVERS.test(method))) return INLINE_CODE_ASK;
  const writes = methods.some((method) => DOT_NET_WRITERS.test(method));
  return writes && PROTECTED_PATH.test(script) ? INLINE_PROTECTED_WRITE_ASK : ALLOW;
}
