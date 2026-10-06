import { readAnsiC } from "./ansi-c.mjs";
import { BASH, commandName, dialectOfShell } from "./dialects.mjs";

const SHELL_KEYWORDS = new Set(["if", "then", "elif", "else", "fi", "do", "done", "while", "until", "!", "{", "}"]);

const WRAPPERS = {
  env: { valued: new Set(["-u", "-C", "--unset", "--chdir"]) },
  sudo: { valued: new Set(["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U", "--user", "--group", "--host"]) },
  doas: { valued: new Set(["-u", "-C"]) },
  timeout: { valued: new Set(["-s", "-k", "--signal", "--kill-after"]), positionals: 1 },
  nice: { valued: new Set(["-n", "--adjustment"]) },
  xargs: { valued: new Set(["-I", "-n", "-L", "-P", "-d", "-E", "-s", "-a", "-l", "--max-args", "--max-procs"]) },
  command: { valued: new Set() },
  time: { valued: new Set(["-f", "-o"]) },
  nohup: { valued: new Set() },
  exec: { valued: new Set(["-a"]) },
  builtin: { valued: new Set() },
  setsid: { valued: new Set() },
};

const REDIRECT_OPERATOR = /^(?:&>>?|<<<|<<-?|<&|>&|>>|>\||<>|<|>)/;

function skipHeredocBodies(command, newlineIndex, heredocs, found) {
  let cursor = newlineIndex;
  for (const { delimiter, owner } of heredocs) {
    const bodyLines = [];
    let closed = false;
    while (!closed && cursor < command.length) {
      const lineStart = cursor + 1;
      const lineEnd = command.indexOf("\n", lineStart);
      const stop = lineEnd === -1 ? command.length : lineEnd;
      const line = command.slice(lineStart, stop).replace(/\r$/, "");
      closed = line.replace(/^\t+/, "") === delimiter;
      if (!closed) bodyLines.push(line);
      cursor = stop;
    }
    const dialect = dialectReadingStdin(owner);
    if (dialect) found.stdinScripts.push({ script: bodyLines.join("\n"), dialect });
  }
  return cursor - 1;
}

function dialectReadingStdin(words) {
  const [command] = stripPrefixes(words).rest;
  return command === undefined ? null : dialectOfShell(commandName(command));
}

function scan(command, dialect, found, start, closer) {
  let words = [];
  let word = "";
  let inWord = false;
  let quote = null;
  let depth = 0;
  let skipNextWord = false;
  let heredocDelimiterNext = false;
  let heredocs = [];

  const finishWord = () => {
    if (heredocDelimiterNext) heredocs.push({ delimiter: word, owner: words });
    else if (!skipNextWord) words.push(word);
    heredocDelimiterNext = false;
    skipNextWord = false;
  };
  const endWord = () => {
    if (inWord) finishWord();
    word = "";
    inWord = false;
  };
  const endSegment = () => {
    endWord();
    skipNextWord = false;
    heredocDelimiterNext = false;
    if (words.length > 0) found.segments.push(words);
    words = [];
  };
  const startsRedirect = (char, next) =>
    char === "<" || char === ">" || (dialect.bashSyntax && char === "&" && next === ">");

  for (let i = start; i < command.length; i += 1) {
    const char = command[i];
    const next = command[i + 1];
    if (quote === "'") {
      if (char === "'") quote = null;
      else word += char;
    } else if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === dialect.escape && next !== undefined && dialect.escapesInDoubleQuotes(next)) {
        i += 1;
        if (next !== "\n") word += next;
      } else if (dialect.substitutionInQuotes && char === "$" && next === "(") {
        i = scan(command, dialect, found, i + 2, ")");
      } else if (dialect.bashSyntax && char === "`") {
        i = scan(command, dialect, found, i + 1, "`");
      } else word += char;
    } else if (dialect.quotes.includes(char)) {
      quote = char;
      inWord = true;
    } else if (char === dialect.escape && next !== undefined) {
      i += 1;
      if (next !== "\n") {
        word += next;
        inWord = true;
      }
    } else if (dialect.bashSyntax && char === "$" && next === "'") {
      const literal = readAnsiC(command, i + 2);
      word += literal.value;
      inWord = true;
      i = literal.end;
    } else if (dialect.bashSyntax && char === "$" && next === '"') {
      quote = '"';
      inWord = true;
      i += 1;
    } else if (char === "$" && next === "(") {
      endSegment();
      depth += 1;
      i += 1;
    } else if ((closer === ")" && char === ")" && depth === 0) || (closer === "`" && char === "`")) {
      endSegment();
      return i;
    } else if (startsRedirect(char, next)) {
      if (inWord && /^\d+$/.test(word)) {
        word = "";
        inWord = false;
      } else endWord();
      const [operator] = REDIRECT_OPERATOR.exec(command.slice(i));
      i += operator.length - 1;
      if (dialect.bashSyntax && operator.startsWith("<<") && operator !== "<<<") heredocDelimiterNext = true;
      else if (!operator.startsWith("<")) skipNextWord = true;
    } else if (dialect.breaks.has(char)) {
      if (char === "(") depth += 1;
      if (char === ")") depth = Math.max(0, depth - 1);
      endSegment();
      if (char === "\n" && heredocs.length > 0) {
        i = skipHeredocBodies(command, i, heredocs, found);
        heredocs = [];
      }
    } else if (/\s/.test(char) || dialect.whitespace.has(char)) {
      endWord();
    } else {
      word += char;
      inWord = true;
    }
  }
  endSegment();
  return command.length;
}

export function splitSegments(command, dialect = BASH) {
  const found = { segments: [], stdinScripts: [] };
  scan(command, dialect, found, 0, null);
  return found;
}

export function asAssignment(word) {
  const match = /^(?:\$env:)?([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/i.exec(word);
  return match ? `${match[1]}=${match[2]}` : null;
}

function consumeWrapper(name, rest) {
  const { valued, positionals = 0 } = WRAPPERS[name];
  if (name === "env" && (rest[0] === "-S" || rest[0] === "--split-string") && rest[1] !== undefined) {
    return [...(splitSegments(rest[1]).segments[0] ?? []), ...rest.slice(2)];
  }
  let index = 0;
  while (index < rest.length && rest[index].startsWith("-")) {
    if (rest[index] === "--") {
      index += 1;
      break;
    }
    index += valued.has(rest[index]) ? 2 : 1;
  }
  return rest.slice(index + positionals);
}

export function stripPrefixes(words) {
  let rest = [...words];
  const assignments = [];
  while (rest.length > 0) {
    const [word] = rest;
    const assignment = asAssignment(word);
    if (SHELL_KEYWORDS.has(word)) {
      rest = rest.slice(1);
    } else if (/^\$env:\w+$/i.test(word) && rest[1] === "=") {
      assignments.push(`${word.slice(5)}=${rest[2] ?? ""}`);
      rest = rest.slice(3);
    } else if (assignment) {
      assignments.push(assignment);
      rest = rest.slice(1);
    } else if (WRAPPERS[commandName(word)]) {
      rest = consumeWrapper(commandName(word), rest.slice(1));
    } else break;
  }
  return { assignments, rest };
}
