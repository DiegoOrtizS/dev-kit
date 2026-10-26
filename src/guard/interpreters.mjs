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

const INLINE_CODE_ASK = ask(
  "This inline script spawns processes or deletes files, and the guard cannot check what it runs. The repo owner must approve it.",
);

function inlineCode(flag, args) {
  return args.flatMap((argument, index) => {
    if (ATTACHED_INLINE.test(argument)) return [argument.slice(argument.indexOf("=") + 1)];
    return flag.test(argument) && args[index + 1] !== undefined ? [args[index + 1]] : [];
  });
}

export function checkInlineCode(name, args) {
  const flag = INLINE_FLAGS[name];
  if (flag === undefined) return ALLOW;
  return inlineCode(flag, args).some((code) => SPAWNS_OR_DELETES.test(code)) ? INLINE_CODE_ASK : ALLOW;
}
