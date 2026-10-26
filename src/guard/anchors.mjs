import { commandName, dialectOfShell } from "./dialects.mjs";
import { isFileCommand } from "./env-files.mjs";
import { setterAssignments } from "./env-setters.mjs";
import { INTERPRETERS } from "./interpreters.mjs";
import { REMOVE_COMMANDS } from "./remove.mjs";

export const ENV_EXPORTERS = new Set(["export", "declare", "typeset", "readonly", "local"]);
const ANCHORS = new Set(["git", "gh", "sst", "lefthook", "find", "eval", "iex", "invoke-expression"]);
const PRINTERS = new Set(["echo", "printf", "write-output", "write-host", "man", "which", "where", "whereis"]);

const PROCESS_STARTERS = new Set(["start-process", "saps"]);
const STARTER_VALUED_FLAGS = /^-(verb|workingdirectory|wd|windowstyle|credential|redirect\w*|loaduserprofile)$/i;

function isAnchor(word) {
  const name = commandName(word);
  return (
    ANCHORS.has(name) ||
    /^sst@/.test(name) ||
    REMOVE_COMMANDS.has(name) ||
    INTERPRETERS.has(name) ||
    dialectOfShell(name) !== null
  );
}

function abbreviates(argument, full) {
  const name = /^-(\w+)$/.exec(argument)?.[1].toLowerCase();
  return name !== undefined && full.startsWith(name);
}

export function launchedWords(name, args) {
  if (!PROCESS_STARTERS.has(name)) return null;
  let file = null;
  const list = [];
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (abbreviates(argument, "filepath")) file = args[(index += 1)] ?? null;
    else if (abbreviates(argument, "argumentlist") || /^-args$/i.test(argument)) list.push(args[(index += 1)] ?? "");
    else if (STARTER_VALUED_FLAGS.test(argument)) index += 1;
    else if (!argument.startsWith("-")) positionals.push(argument);
  }
  file ??= positionals.shift() ?? null;
  if (file === null) return null;
  return [file, ...[...list, ...positionals].flatMap((item) => item.split(/[\s,]+/).filter(Boolean))];
}

function isKnownCommand(command, name, dialect) {
  return (
    isAnchor(command) ||
    ENV_EXPORTERS.has(name) ||
    PRINTERS.has(name) ||
    isFileCommand(name) ||
    setterAssignments(name, [], dialect) !== null
  );
}

export function reanchored(rest, dialect) {
  const [command] = rest;
  if (isKnownCommand(command, commandName(command), dialect)) return null;
  const index = rest.findIndex((word, position) => position > 0 && isAnchor(word));
  return index === -1 ? null : rest.slice(index);
}
