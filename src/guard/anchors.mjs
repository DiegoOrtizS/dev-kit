import { commandName, dialectOfShell } from "./dialects.mjs";
import { isFileCommand } from "./env-files.mjs";
import { setterAssignments } from "./env-setters.mjs";
import { REMOVE_COMMANDS } from "./remove.mjs";

export const ENV_EXPORTERS = new Set(["export", "declare", "typeset", "readonly", "local"]);
const ANCHORS = new Set(["git", "gh", "sst", "lefthook", "find", "eval", "iex", "invoke-expression"]);
const PRINTERS = new Set(["echo", "printf", "write-output", "write-host", "man", "which", "where", "whereis"]);

function isAnchor(word) {
  const name = commandName(word);
  if (/^[A-Z_][A-Z0-9_]*$/.test(word)) return false;
  return ANCHORS.has(name) || REMOVE_COMMANDS.has(name) || dialectOfShell(name) !== null;
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
