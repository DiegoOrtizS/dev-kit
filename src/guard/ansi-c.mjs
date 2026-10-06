const SIMPLE_C_ESCAPES = {
  n: "\n",
  t: "\t",
  r: "\r",
  a: "\x07",
  b: "\b",
  f: "\f",
  v: "\v",
  e: "\x1b",
  E: "\x1b",
  "\\": "\\",
  "'": "'",
  '"': '"',
  "?": "?",
};
const NUMERIC_C_ESCAPE = /^(?:x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{1,4})|U([0-9a-fA-F]{1,8})|([0-7]{1,3}))/;

const MAX_CODE_POINT = 0x10ffff;

export function readAnsiC(command, start) {
  let value = "";
  for (let i = start; i < command.length; i += 1) {
    const char = command[i];
    if (char === "'") return { value, end: i };
    if (char !== "\\" || i + 1 >= command.length) {
      value += char;
      continue;
    }
    const escaped = command.slice(i + 1);
    const numeric = NUMERIC_C_ESCAPE.exec(escaped);
    if (numeric) {
      const octal = numeric[4] !== undefined;
      const code = Number.parseInt(numeric[1] ?? numeric[2] ?? numeric[3] ?? numeric[4], octal ? 8 : 16);
      value += code <= MAX_CODE_POINT ? String.fromCodePoint(code) : "";
      i += numeric[0].length;
    } else {
      value += SIMPLE_C_ESCAPES[escaped[0]] ?? `\\${escaped[0]}`;
      i += 1;
    }
  }
  return { value, end: command.length };
}
