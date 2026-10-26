import { commandName, dialectOfShell } from "./dialects.mjs";
import { stripPrefixes } from "./prefixes.mjs";

function dialectReadingStdin(words) {
  const [command] = stripPrefixes(words).rest;
  return command === undefined ? null : dialectOfShell(commandName(command));
}

export function stdinScripts({ heredocs }) {
  return heredocs.flatMap(({ owner, body }) => {
    const dialect = dialectReadingStdin(owner);
    return dialect ? [{ script: body, dialect }] : [];
  });
}
