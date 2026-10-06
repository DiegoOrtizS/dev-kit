import { basename } from "node:path";

export const BASH = {
  escape: "\\",
  quotes: "'\"",
  breaks: new Set([";", "|", "&", "\n", "(", ")", "`"]),
  whitespace: new Set(),
  escapesInDoubleQuotes: (char) => ['"', "\\", "$", "`", "\n"].includes(char),
  substitutionInQuotes: true,
  bashSyntax: true,
};
export const POWERSHELL = {
  escape: "`",
  quotes: "'\"",
  breaks: new Set([";", "|", "&", "\n", "(", ")", "{", "}"]),
  whitespace: new Set(),
  escapesInDoubleQuotes: () => true,
  substitutionInQuotes: true,
  bashSyntax: false,
};
const CMD = {
  escape: "^",
  quotes: '"',
  breaks: new Set(["|", "&", "\n", "(", ")"]),
  whitespace: new Set([",", ";", "="]),
  escapesInDoubleQuotes: () => false,
  substitutionInQuotes: false,
  bashSyntax: false,
};

const POSIX_SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const POWERSHELLS = new Set(["pwsh", "powershell"]);

const CMD_SWITCH_RUN = /^\/\/?[ckr]/i;

export function commandName(word) {
  return basename(word.replace(/\\/g, "/"))
    .toLowerCase()
    .replace(/\.(exe|cmd|bat|ps1)$/, "");
}

export function dialectOfShell(name) {
  if (POSIX_SHELLS.has(name)) return BASH;
  if (POWERSHELLS.has(name)) return POWERSHELL;
  return name === "cmd" ? CMD : null;
}

export function scriptFromShell(name, args) {
  const script = shellScript(name, args);
  return script === null ? null : { script, dialect: dialectOfShell(name) };
}

function isPowerShellCommandFlag(argument) {
  const name = /^-(\w+)$/.exec(argument)?.[1].toLowerCase();
  if (name === undefined) return false;
  return "command".startsWith(name) || name === "cwa" || (name.length >= 8 && "commandwithargs".startsWith(name));
}

function shellScript(name, args) {
  if (POSIX_SHELLS.has(name)) {
    const flagIndex = args.findIndex((argument) => /^-[A-Za-z]*c[A-Za-z]*$/.test(argument));
    if (flagIndex === -1) return null;
    return args.slice(flagIndex + 1).find((argument) => !argument.startsWith("-")) ?? null;
  }
  if (POWERSHELLS.has(name)) {
    const flagIndex = args.findIndex(isPowerShellCommandFlag);
    if (flagIndex !== -1) return args.slice(flagIndex + 1).join(" ");
    const encodedIndex = args.findIndex((argument) =>
      /^-e(c|n|nc|nco|ncod|ncode|ncoded|ncodedc|ncodedco.*)?$/i.test(argument),
    );
    if (encodedIndex === -1 || args[encodedIndex + 1] === undefined) return null;
    return Buffer.from(args[encodedIndex + 1], "base64").toString("utf16le");
  }
  if (name === "cmd") {
    const flagIndex = args.findIndex((argument) => CMD_SWITCH_RUN.test(argument));
    if (flagIndex === -1) return null;
    const glued = args[flagIndex].replace(CMD_SWITCH_RUN, "");
    return [glued, ...args.slice(flagIndex + 1)].filter(Boolean).join(" ");
  }
  return null;
}
