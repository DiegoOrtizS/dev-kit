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
