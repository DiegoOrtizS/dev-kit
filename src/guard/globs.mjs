const BRACE_GROUP = /\{([^{}]*)\}/;
const SEQUENCE = /^[^.]*\.\.[^.]*$/;
const MAX_ALTERNATIVES = 64;
const BRACKET = /\[!?\]?(?:\[:[a-z]+:\]|[^\]])*\]/gi;
const BRACKET_ONE = /^\[!?\]?(?:\[:[a-z]+:\]|[^\]])*\]/i;
const POSIX_CLASS = /\[:[a-z]+:\]/i;
const EXTGLOB = /[@+!?*]\([^()]*\)/;

export function hasGlob(text) {
  return /[*?[]/.test(text) || EXTGLOB.test(text);
}

export function normalizeGlobs(path) {
  let current = path;
  for (let previous = ""; current !== previous;) {
    previous = current;
    current = current.replace(new RegExp(EXTGLOB, "g"), "*");
  }
  return current;
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
  return /^[*?.]+$/.test(normalizeGlobs(segment).replace(BRACKET, "?"));
}

function matchClass(token, char) {
  if (char === "/" && !token.cross) return false;
  const body = token.cls;
  let hit = false;
  for (let i = 0; i < body.length;) {
    if (body[i + 1] === "-" && i + 2 < body.length) {
      if (char >= body[i] && char <= body[i + 2]) hit = true;
      i += 3;
    } else {
      if (char === body[i]) hit = true;
      i += 1;
    }
  }
  return token.negated ? !hit : hit;
}

function tokenizeGlob(pattern, crossSlash) {
  const tokens = [];
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      let cross = crossSlash;
      while (pattern[index + 1] === "*") {
        cross = true;
        index += 1;
      }
      tokens.push({ star: true, cross });
    } else if (char === "?") {
      tokens.push({ one: true, cross: crossSlash });
    } else {
      const bracket = char === "[" ? BRACKET_ONE.exec(pattern.slice(index)) : null;
      if (bracket === null) {
        tokens.push({ lit: char });
      } else if (POSIX_CLASS.test(bracket[0])) {
        tokens.push({ one: true, cross: crossSlash });
        index += bracket[0].length - 1;
      } else {
        const inner = bracket[0].slice(1, -1);
        const negated = inner.startsWith("!") || inner.startsWith("^");
        tokens.push({ cls: negated ? inner.slice(1) : inner, negated, cross: crossSlash });
        index += bracket[0].length - 1;
      }
    }
  }
  return tokens;
}

export function globMatch(pattern, text, { crossSlash = false } = {}) {
  const tokens = tokenizeGlob(pattern, crossSlash);
  const length = text.length;
  let reachable = new Array(length + 1).fill(false);
  reachable[0] = true;
  for (const token of tokens) {
    const next = new Array(length + 1).fill(false);
    for (let position = 0; position <= length; position += 1) {
      if (!reachable[position]) continue;
      if (token.star) {
        next[position] = true;
        for (let end = position; end < length; end += 1) {
          if (!token.cross && text[end] === "/") break;
          next[end + 1] = true;
        }
      } else if (position < length) {
        const char = text[position];
        const ok =
          token.lit !== undefined
            ? char === token.lit
            : token.one
              ? token.cross || char !== "/"
              : matchClass(token, char);
        if (ok) next[position + 1] = true;
      }
    }
    reachable = next;
  }
  return reachable[length];
}
