import { BASH, POWERSHELL, commandName, dialectOfShell, shellReadsStdin } from "./dialects.mjs";
import { stripPrefixes } from "./prefixes.mjs";
import { deny } from "./verdict.mjs";

export const EXPRESSION_RUNNERS = new Set(["iex", "invoke-expression"]);
const SOURCERS = new Set(["source", "."]);
const PRINTERS = new Set(["echo", "printf", "write-output"]);

export function unreadableScript(name) {
  return deny(
    `Blocked: ${name} would run whatever reaches it, and the guard cannot read that. Pass the commands as a literal string instead.`,
  );
}

export function isDynamic(text) {
  return text.trim() === "" || /[$`]/.test(text);
}

function consumerDialect(words) {
  const [command, ...args] = stripPrefixes(words).rest;
  if (command === undefined) return null;
  const name = commandName(command);
  if (EXPRESSION_RUNNERS.has(name)) return POWERSHELL;
  if (SOURCERS.has(name) && args.length === 0) return BASH;
  return shellReadsStdin(name, args) ? dialectOfShell(name) : null;
}

function printedText(args) {
  let index = 0;
  while (index < args.length && args[index].startsWith("-")) index += 1;
  return args.slice(index).join(" ");
}

function literalText(from, found, dialect) {
  if (/[$`]/.test(from.raw)) return null;
  const [command, ...args] = stripPrefixes(from.words).rest;
  if (command === undefined) return null;
  const name = commandName(command);
  if (PRINTERS.has(name)) return printedText(args);
  if (name === "cat" && args.length === 0)
    return found.heredocs.find(({ owner }) => owner === from.words)?.body ?? null;
  if (dialect === POWERSHELL && from.words.length === 1 && /^\s*["']/.test(from.raw)) return from.words[0];
  return null;
}

function expressionScript(words, fed) {
  const [command, ...args] = stripPrefixes(words).rest;
  if (command === undefined || !EXPRESSION_RUNNERS.has(commandName(command))) return null;
  const text = args.filter((argument, index) => !(index === 0 && /^-c/i.test(argument)));
  if (text.length > 0 && !text.some((argument) => argument.includes("$"))) return { script: text.join(" ") };
  return fed ? null : { opaque: commandName(command) };
}

export function stdinScripts(found, dialect) {
  const scripts = [];
  const opaque = [];
  const fed = new Set(found.pipes.map(({ to }) => to));
  for (const words of found.segments) {
    const expression = expressionScript(words, fed.has(words));
    if (expression?.script !== undefined) scripts.push({ script: expression.script, dialect: POWERSHELL });
    if (expression?.opaque !== undefined) opaque.push(expression.opaque);
  }
  for (const { owner, body } of found.heredocs) {
    const consumer = consumerDialect(owner);
    if (consumer === null) continue;
    if (isDynamic(body)) opaque.push(commandName(stripPrefixes(owner).rest[0]));
    else scripts.push({ script: body, dialect: consumer });
  }
  for (const { from, to } of found.pipes) {
    const consumer = consumerDialect(to);
    if (consumer === null) continue;
    const text = literalText(from, found, dialect);
    if (text === null) opaque.push(commandName(stripPrefixes(to).rest[0]));
    else scripts.push({ script: text, dialect: consumer });
  }
  return { scripts, opaque };
}
