import { isAnchor } from "./anchors.mjs";
import { POWERSHELL } from "./dialects.mjs";
import { stripPrefixes } from "./prefixes.mjs";
import { splitSegments } from "./segments.mjs";
import { deny } from "./verdict.mjs";

const POWERSHELL_ALIAS_SETTERS = new Set(["set-alias", "new-alias", "sal", "nal"]);
const POSIX_DEFINITION = /^[^=\s]+=([\s\S]*)$/;

export const HIDDEN_COMMAND = deny(
  "Blocked: an alias for a command the guard checks (git, gh, a delete, a shell, an interpreter) would later run it under a name the guard does not check. Call the command by its own name.",
);

export function aliasDefinitions(name, args, dialect) {
  if (dialect.bashSyntax && name === "alias") {
    return args.map((argument) => POSIX_DEFINITION.exec(argument)?.[1]).filter((value) => value !== undefined);
  }
  if (dialect === POWERSHELL && POWERSHELL_ALIAS_SETTERS.has(name)) {
    return args.filter((argument) => !argument.startsWith("-"));
  }
  return [];
}

export function hidesCommand(definitions) {
  return definitions.some((text) =>
    splitSegments(text).segments.some((words) => {
      const [command] = stripPrefixes(words).rest;
      return command !== undefined && isAnchor(command);
    }),
  );
}
