export const PS_REMOVERS = new Set(["remove-item", "ri", "rm", "rd", "rmdir", "del", "erase"]);
const PS_VALUED_FLAG = /^-(?:filter|include|exclude|depth)$/i;
const PS_UNREADABLE = /^@/;

function psFlagName(flag) {
  return /^-([A-Za-z]+)/.exec(flag)?.[1].toLowerCase() ?? null;
}

function isRecurseFlag(flag) {
  const name = psFlagName(flag);
  if (name === null) return false;
  return "recurse".startsWith(name) || (name.length >= 2 && "force".startsWith(name));
}

function isPathFlag(flag) {
  const name = psFlagName(flag);
  if (name === null) return false;
  return "path".startsWith(name) || "literalpath".startsWith(name) || "pspath".startsWith(name) || name === "lp";
}

function collect(value, targets) {
  for (const element of value.split(",").filter(Boolean)) targets.push(element);
}

export function powershellRemoveTargets(rawArgs) {
  let recursive = false;
  let unreadable = false;
  const targets = [];
  for (let index = 0; index < rawArgs.length; index += 1) {
    const colon = /^(-[A-Za-z]+):(.*)$/.exec(rawArgs[index]);
    const flag = colon ? colon[1] : rawArgs[index];
    if (isRecurseFlag(flag)) recursive = true;
    else if (isPathFlag(flag)) {
      const value = colon ? colon[2] : rawArgs[(index += 1)];
      if (value === undefined) continue;
      if (PS_UNREADABLE.test(value)) unreadable = true;
      else collect(value, targets);
    } else if (PS_VALUED_FLAG.test(flag)) {
      if (!colon) index += 1;
    } else if (!rawArgs[index].startsWith("-")) {
      if (PS_UNREADABLE.test(rawArgs[index])) unreadable = true;
      else collect(rawArgs[index], targets);
    }
  }
  return { recursive, targets, unreadable };
}
