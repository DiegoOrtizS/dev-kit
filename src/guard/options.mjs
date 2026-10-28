export function longOptionName(option) {
  return option.startsWith("--") ? option.slice(2).split("=")[0] : null;
}

export function isLongOption(option, full, minimumLength = 1) {
  const name = longOptionName(option);
  return name !== null && name.length >= minimumLength && full.startsWith(name);
}

export function isShortFlagCluster(argument, letter) {
  return /^-[A-Za-z]+$/.test(argument) && argument.slice(1).includes(letter);
}

export function parseArguments(args, valued) {
  const values = {};
  const flags = [];
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const attachedLong = /^(--[\w-]+)=([\s\S]*)$/.exec(argument);
    const attachedShort = /^(-[A-Za-z])([\s\S]+)$/.exec(argument);
    if (argument === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    } else if (attachedLong !== null) values[attachedLong[1]] = attachedLong[2];
    else if (valued.has(argument)) values[argument] = args[(index += 1)] ?? "";
    else if (attachedShort !== null && valued.has(attachedShort[1])) values[attachedShort[1]] = attachedShort[2];
    else if (argument.startsWith("-") && argument !== "-") flags.push(argument);
    else positionals.push(argument);
  }
  return { values, flags, positionals };
}
