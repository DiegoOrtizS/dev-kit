import { commandName } from "./dialects.mjs";
import { stripPrefixes } from "./prefixes.mjs";
import { REMOVE_COMMANDS } from "./remove.mjs";

const FIND_GLOBAL_OPTION = /^-[HLP]$|^-O\d*$/;
const NARROWING_PREDICATES = new Set([
  "-name",
  "-iname",
  "-path",
  "-ipath",
  "-wholename",
  "-iwholename",
  "-regex",
  "-iregex",
  "-lname",
  "-ilname",
]);
const MATCHES_EVERYTHING = /^[*?.]*$/;
const EXEC_PREDICATES = new Set(["-exec", "-execdir", "-ok", "-okdir"]);

export function findStartPaths(args) {
  let index = 0;
  while (index < args.length && FIND_GLOBAL_OPTION.test(args[index])) index += 1;
  if (args[index] === "-D") index += 2;
  const paths = [];
  while (index < args.length && !/^[-!(]/.test(args[index])) {
    paths.push(args[index]);
    index += 1;
  }
  return paths.length > 0 ? paths : ["."];
}

function deletesMatches(args) {
  if (args.includes("-delete")) return true;
  return args.some((argument, index) => {
    if (!EXEC_PREDICATES.has(argument)) return false;
    const [command] = stripPrefixes(args.slice(index + 1)).rest;
    return command !== undefined && REMOVE_COMMANDS.has(commandName(command));
  });
}

function isNarrowed(args) {
  return args.some(
    (argument, index) =>
      argument === "-empty" || (NARROWING_PREDICATES.has(argument) && !MATCHES_EVERYTHING.test(args[index + 1] ?? "")),
  );
}

export function findDeleteTargets(args) {
  return deletesMatches(args) && !isNarrowed(args) ? findStartPaths(args) : [];
}
