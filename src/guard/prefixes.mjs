import { commandName } from "./dialects.mjs";
import { splitSegments } from "./segments.mjs";

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
