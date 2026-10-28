export function extglobGroupEnd(command, open) {
  let depth = 0;
  for (let index = open; index < command.length; index += 1) {
    const char = command[index];
    if (char === "'" || char === '"' || char === "$" || char === "`") return -1;
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
