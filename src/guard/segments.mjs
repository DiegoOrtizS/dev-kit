import { readAnsiC } from "./ansi-c.mjs";
import { BASH } from "./dialects.mjs";

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
    found.heredocs.push({ owner, body: bodyLines.join("\n") });
  }
  return cursor - 1;
}

function scan(command, dialect, found, start, closer) {
  let words = [];
  let word = "";
  let inWord = false;
  let quote = null;
  let depth = 0;
  let skipNextWord = false;
  let heredocDelimiterNext = false;
  let hereStringNext = false;
  let heredocs = [];
  let segmentStart = start;
  let pipedFrom = null;
  let substitutedCommandDepth = null;
  let inBacktick = false;

  const finishWord = () => {
    if (heredocDelimiterNext) heredocs.push({ delimiter: word, owner: words });
    else if (hereStringNext) found.heredocs.push({ owner: words, body: word });
    else if (skipNextWord) found.written.push(word);
    else words.push(word);
    heredocDelimiterNext = false;
    hereStringNext = false;
    skipNextWord = false;
  };
  const endWord = () => {
    if (inWord) finishWord();
    word = "";
    inWord = false;
  };
  const endSegment = (end, pipes = false) => {
    endWord();
    skipNextWord = false;
    heredocDelimiterNext = false;
    hereStringNext = false;
    if (words.length > 0) {
      found.segments.push(words);
      if (pipedFrom !== null) found.pipes.push({ from: pipedFrom, to: words });
      pipedFrom = null;
    }
    if (pipes) pipedFrom = { words, raw: command.slice(segmentStart, end) };
    segmentStart = end + 1;
    words = [];
  };
  const processSubstitution = (operator, begin) => {
    const before = found.segments.length;
    const end = scan(command, dialect, found, begin + 2, ")");
    const inner = found.segments.slice(before);
    const fed = { words: inner.length === 1 ? inner[0] : [], raw: command.slice(begin + 2, end) };
    if (operator === "<") found.pipes.push({ from: fed, to: words });
    else found.pipes.push({ from: { words, raw: command.slice(segmentStart, begin) }, to: fed.words });
    return end;
  };
  const substitution = (begin, skip, closing) => {
    const end = scan(command, dialect, found, begin + skip, closing);
    word += command.slice(begin, end + 1);
    return end;
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
        i = substitution(i, 2, ")");
      } else if (dialect.bashSyntax && char === "`") {
        i = substitution(i, 1, "`");
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
    } else if (char === "$" && next === "(" && (words.length > 0 || inWord)) {
      i = substitution(i, 2, ")");
      inWord = true;
    } else if (dialect.bashSyntax && char === "`" && closer !== "`" && !inBacktick && (words.length > 0 || inWord)) {
      i = substitution(i, 1, "`");
      inWord = true;
    } else if (char === "$" && next === "(") {
      if (words.length === 0 && !inWord) substitutedCommandDepth = depth;
      endSegment(i);
      depth += 1;
      i += 1;
    } else if ((closer === ")" && char === ")" && depth === 0) || (closer === "`" && char === "`")) {
      endSegment(i);
      return i;
    } else if (dialect.bashSyntax && !inWord && (char === "<" || char === ">") && next === "(") {
      i = processSubstitution(char, i);
    } else if (dialect.comments && !inWord && char === "#") {
      const lineEnd = command.indexOf("\n", i);
      i = (lineEnd === -1 ? command.length : lineEnd) - 1;
    } else if (startsRedirect(char, next)) {
      if (inWord && /^\d+$/.test(word)) {
        word = "";
        inWord = false;
      } else endWord();
      const [operator] = REDIRECT_OPERATOR.exec(command.slice(i));
      i += operator.length - 1;
      if (dialect.bashSyntax && operator === "<<<") hereStringNext = true;
      else if (dialect.bashSyntax && operator.startsWith("<<")) heredocDelimiterNext = true;
      else if (!operator.startsWith("<")) skipNextWord = true;
    } else if (dialect.breaks.has(char)) {
      if (char === "(") depth += 1;
      if (char === ")") depth = Math.max(0, depth - 1);
      const opensBacktick = char === "`" && !inBacktick;
      if (char === "`") inBacktick = !inBacktick;
      if (opensBacktick && dialect.bashSyntax && words.length === 0 && !inWord) substitutedCommandDepth = -1;
      endSegment(i, char === "|" && next !== "|" && command[i - 1] !== "|");
      const closesSubstitutedCommand =
        (char === ")" && depth === substitutedCommandDepth) ||
        (char === "`" && !inBacktick && substitutedCommandDepth === -1);
      if (closesSubstitutedCommand) {
        words.push(char === ")" ? "$(" : "`");
        substitutedCommandDepth = null;
      }
      if (char === "\n" && heredocs.length > 0) {
        i = skipHeredocBodies(command, i, heredocs, found);
        segmentStart = i + 1;
        heredocs = [];
      }
    } else if (/\s/.test(char) || dialect.whitespace.has(char)) {
      endWord();
    } else {
      word += char;
      inWord = true;
    }
  }
  endSegment(command.length);
  return command.length;
}

export function splitSegments(command, dialect = BASH) {
  const found = { segments: [], heredocs: [], written: [], pipes: [] };
  scan(command, dialect, found, 0, null);
  return found;
}
