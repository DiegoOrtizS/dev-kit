import { basename } from "node:path";

export const BASH = {
  escape: "\\",
  quotes: "'\"",
  breaks: new Set([";", "|", "&", "\n", "(", ")", "`"]),
  whitespace: new Set(),
  escapesInDoubleQuotes: (char) => ['"', "\\", "$", "`", "\n"].includes(char),
  substitutionInQuotes: true,
  bashSyntax: true,
  comments: true,
};
export const POWERSHELL = {
  escape: "`",
  quotes: "'\"",
  breaks: new Set([";", "|", "&", "\n", "(", ")", "{", "}"]),
  whitespace: new Set(),
  escapesInDoubleQuotes: () => true,
  substitutionInQuotes: true,
  bashSyntax: false,
  comments: true,
};
export const CMD = {
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

const POWERSHELL_VALUED_FLAGS = [
  ["file", 1],
  ["executionpolicy", 2],
  ["workingdirectory", 2],
  ["windowstyle", 1],
  ["inputformat", 3],
  ["outputformat", 1],
  ["configurationname", 3],
  ["version", 1],
  ["psconsolefile", 3],
  ["settingsfile", 8],
  ["custompipename", 6],
];
const POSIX_VALUED_FLAGS = new Set(["-o", "-O", "+O", "--rcfile", "--init-file"]);
const ENCODED_FLAG = /^e(c|n|nc|nco|ncod|ncode|ncoded|ncodedc|ncodedco.*)?$/i;

function powershellFlagName(argument) {
  return /^(?:--?|\/)([A-Za-z]\w*)$/.exec(argument)?.[1].toLowerCase() ?? null;
}

function isPowerShellCommandFlag(argument) {
  const name = powershellFlagName(argument);
  if (name === null) return false;
  return "command".startsWith(name) || name === "cwa" || (name.length >= 8 && "commandwithargs".startsWith(name));
}

function takesValue(name) {
  return POWERSHELL_VALUED_FLAGS.some(([full, minimum]) => name.length >= minimum && full.startsWith(name));
}

function powershellPositionals(args) {
  let index = 0;
  while (index < args.length) {
    const name = powershellFlagName(args[index]);
    if (name === null) break;
    index += takesValue(name) ? 2 : 1;
  }
  return args.slice(index);
}

function powershellScript(args) {
  const flagIndex = args.findIndex(isPowerShellCommandFlag);
  if (flagIndex !== -1) {
    const script = args.slice(flagIndex + 1).join(" ");
    return script.trim() === "-" ? null : script;
  }
  const encodedIndex = args.findIndex((argument) => ENCODED_FLAG.test(powershellFlagName(argument) ?? ""));
  if (encodedIndex !== -1) {
    return args[encodedIndex + 1] === undefined
      ? null
      : Buffer.from(args[encodedIndex + 1], "base64").toString("utf16le");
  }
  const positionals = powershellPositionals(args);
  if (positionals.length === 0 || positionals[0] === "-" || /\.ps1$/i.test(positionals[0])) return null;
  return positionals.join(" ");
}

export function shellReadsStdin(name, args) {
  if (dialectOfShell(name) === null || shellScript(name, args) !== null) return false;
  if (POWERSHELLS.has(name)) {
    const fileIndex = args.findIndex((argument) => "file".startsWith(powershellFlagName(argument) ?? "-"));
    if (fileIndex !== -1 && args[fileIndex + 1] !== undefined && args[fileIndex + 1] !== "-") return false;
    return powershellPositionals(args).every((argument) => argument === "-");
  }
  if (name === "cmd") return args.every((argument) => argument.startsWith("/"));
  return args.every((argument, index) => /^[-+]/.test(argument) || POSIX_VALUED_FLAGS.has(args[index - 1] ?? ""));
}

function shellScript(name, args) {
  if (POSIX_SHELLS.has(name)) {
    const flagIndex = args.findIndex((argument) => /^-[A-Za-z]*c[A-Za-z]*$/.test(argument));
    if (flagIndex === -1) return null;
    return args.slice(flagIndex + 1).find((argument) => !argument.startsWith("-")) ?? null;
  }
  if (POWERSHELLS.has(name)) return powershellScript(args);
  if (name === "cmd") {
    const flagIndex = args.findIndex((argument) => CMD_SWITCH_RUN.test(argument));
    if (flagIndex === -1) return null;
    const glued = args[flagIndex].replace(CMD_SWITCH_RUN, "");
    return [glued, ...args.slice(flagIndex + 1)].filter(Boolean).join(" ");
  }
  return null;
}
