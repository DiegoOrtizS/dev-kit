const BRACE_GROUP = /\{([^{}]*)\}/;
const SEQUENCE = /^[^.]*\.\.[^.]*$/;
const MAX_ALTERNATIVES = 64;
const BRACKET = /\[!?\]?[^\]]*\]/g;

export function hasGlob(text) {
  return /[*?[]/.test(text);
}

function expandOnce(word) {
  const match = BRACE_GROUP.exec(word);
  if (match === null) return null;
  const [group, body] = match;
  const before = word.slice(0, match.index);
  const after = word.slice(match.index + group.length);
  if (body.includes(",")) return body.split(",").map((option) => `${before}${option}${after}`);
  if (SEQUENCE.test(body)) return [`${before}*${after}`];
  return null;
}

export function expandBraces(word) {
  let pending = [word];
  const done = [];
  while (pending.length > 0) {
    const current = pending.pop();
    const expanded = expandOnce(current);
    if (expanded === null) done.push(current);
    else pending.push(...expanded);
    if (done.length + pending.length > MAX_ALTERNATIVES) return [word.replace(/\{[^{}]*\}/g, "*")];
  }
  return done;
}

export function isWholeDirectorySegment(segment) {
  return /^[*?.]+$/.test(segment.replace(BRACKET, "?"));
}

function bracketClass(bracket) {
  const body = bracket.slice(1, -1).replace(/\\/g, "\\\\");
  return `[${body.startsWith("!") ? `^${body.slice(1)}` : body}]`;
}

export function globRegExp(path, { crossSlash = false } = {}) {
  const any = crossSlash ? ".*" : "[^/]*";
  const one = crossSlash ? "." : "[^/]";
  let source = "";
  for (let index = 0; index < path.length; index += 1) {
    const char = path[index];
    const bracket = char === "[" ? /^\[!?\]?[^\]]*\]/.exec(path.slice(index)) : null;
    if (bracket !== null) {
      source += bracketClass(bracket[0]);
      index += bracket[0].length - 1;
    } else if (char === "*" && path[index + 1] === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") source += any;
    else if (char === "?") source += one;
    else source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}
