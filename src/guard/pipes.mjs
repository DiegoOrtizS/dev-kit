import { commandName } from "./dialects.mjs";
import { findDeleteTargets } from "./find.mjs";
import { stripPrefixes } from "./prefixes.mjs";
import { REMOVE_COMMANDS, checkRemove, removeTargets } from "./remove.mjs";
import { ALLOW, deny, firstBlock } from "./verdict.mjs";

const PRINTERS = new Set(["echo", "printf", "write-output"]);
const PATH_LISTERS = new Set(["ls", "dir", "get-childitem", "gci", "get-item", "gi"]);
const LISTER_PATH_OPTION = /^-(path|literalpath|lp|p)$/i;
const LISTER_VALUED_OPTION = /^-(filter|include|exclude|depth|attributes)$/i;
const LISTER_NARROWING_OPTION = /^-(filter|include)$/i;
const MATCHES_EVERYTHING = /^[*?.]*$/;
const PLACEHOLDER = "{}";

function listedPaths(args) {
  const paths = [];
  let narrowed = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (LISTER_PATH_OPTION.test(argument)) {
      if (args[index + 1] !== undefined) paths.push(args[index + 1]);
      index += 1;
    } else if (LISTER_VALUED_OPTION.test(argument)) {
      narrowed ||= LISTER_NARROWING_OPTION.test(argument) && !MATCHES_EVERYTHING.test(args[index + 1] ?? "");
      index += 1;
    } else if (!argument.startsWith("-")) paths.push(argument);
  }
  if (narrowed) return [];
  return paths.length > 0 ? paths : ["."];
}

function producedPaths({ words, raw }) {
  if (/[$`]/.test(raw)) return null;
  const [command, ...args] = stripPrefixes(words).rest;
  if (command === undefined) return null;
  const name = commandName(command);
  if (PRINTERS.has(name)) return args.filter((argument) => !argument.startsWith("-"));
  if (name === "find") return findDeleteTargets([...args, "-delete"]);
  if (PATH_LISTERS.has(name)) return listedPaths(args);
  return null;
}

function checkPipe({ from, to }, context, dialect) {
  const [command, ...args] = stripPrefixes(to).rest;
  if (command === undefined) return ALLOW;
  const name = commandName(command);
  if (!REMOVE_COMMANDS.has(name) || !removeTargets(name, args, dialect).recursive) return ALLOW;
  const paths = producedPaths(from);
  if (paths === null) {
    return deny(
      `Blocked: ${name} would delete recursively whatever the pipe feeds it, and the guard cannot read that. Name the paths instead.`,
    );
  }
  return checkRemove(name, [...args.filter((argument) => argument !== PLACEHOLDER), ...paths], context, dialect);
}

export function checkPipes(pipes, context, dialect) {
  return firstBlock(pipes.map((pipe) => checkPipe(pipe, context, dialect)));
}
