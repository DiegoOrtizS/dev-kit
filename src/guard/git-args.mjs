import { isLongOption, longOptionName } from "./options.mjs";

const GIT_CONFIG_OPTIONS_WITH_VALUE = new Set(["-f", "--file", "--blob", "-t", "--type", "--default", "--comment"]);
const GIT_CONFIG_LONG_OPTIONS_WITH_VALUE = ["file", "blob", "type", "default", "comment"];
const GIT_CONFIG_WRITE_OPTIONS = [
  "add",
  "unset",
  "unset-all",
  "replace-all",
  "remove-section",
  "rename-section",
  "edit",
];
const GIT_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--config-env",
]);
const GIT_CONFIG_READ_SUBCOMMANDS = new Set(["get", "list"]);

const PUSH_OPTIONS_WITH_VALUE = new Set(["-o", "--push-option", "--receive-pack", "--exec"]);
const MESSAGE_OPTIONS = new Set(["-m", "-F", "--message"]);

export function gitInvocation(args) {
  const configEntries = [];
  let index = 0;
  while (index < args.length && args[index].startsWith("-")) {
    const option = args[index];
    if ((option === "-c" || option === "--config-env") && index + 1 < args.length) {
      configEntries.push(args[index + 1]);
    } else if (/^-c./.test(option)) {
      configEntries.push(option.slice(2));
    } else if (option.startsWith("--config-env=")) {
      configEntries.push(option.slice("--config-env=".length));
    }
    index += GIT_OPTIONS_WITH_VALUE.has(option) ? 2 : 1;
  }
  return { configEntries, subcommand: args[index], rest: args.slice(index + 1) };
}

export function splitOptionsAndPositionals(rest) {
  const options = [];
  const positionals = [];
  let optionsEnded = false;
  for (let i = 0; i < rest.length; i += 1) {
    const argument = rest[i];
    if (MESSAGE_OPTIONS.has(argument)) i += 1;
    else if (optionsEnded) positionals.push(argument);
    else if (argument === "--") optionsEnded = true;
    else if (argument.startsWith("-") && argument !== "-") options.push(argument);
    else positionals.push(argument);
  }
  return { options, positionals };
}

export function parsePush(rest) {
  const options = [];
  const positionals = [];
  let remoteFromOption = false;
  let optionsEnded = false;
  for (let i = 0; i < rest.length; i += 1) {
    const argument = rest[i];
    if (optionsEnded) {
      positionals.push(argument);
    } else if (argument === "--") {
      optionsEnded = true;
    } else if (argument.startsWith("--")) {
      options.push(argument);
      const attached = argument.includes("=");
      if (isLongOption(argument, "repo", 3)) {
        remoteFromOption = true;
        if (!attached) i += 1;
      } else if (!attached && [...PUSH_OPTIONS_WITH_VALUE].some((name) => argument === name)) {
        i += 1;
      }
    } else if (argument.startsWith("-") && argument !== "-") {
      options.push(argument);
      if (PUSH_OPTIONS_WITH_VALUE.has(argument)) i += 1;
    } else {
      positionals.push(argument);
    }
  }
  return { options, refspecs: remoteFromOption ? positionals : positionals.slice(1) };
}

export function parseGitConfig(rest) {
  const options = [];
  const positionals = [];
  let optionsEnded = false;
  for (let i = 0; i < rest.length; i += 1) {
    const argument = rest[i];
    if (optionsEnded) {
      positionals.push(argument);
    } else if (argument === "--") {
      optionsEnded = true;
    } else if (argument.startsWith("-") && argument !== "-") {
      options.push(argument);
      const attached = argument.includes("=");
      const takesValue =
        GIT_CONFIG_OPTIONS_WITH_VALUE.has(argument) ||
        GIT_CONFIG_LONG_OPTIONS_WITH_VALUE.some((name) => isLongOption(argument, name, 3));
      if (takesValue && !attached) i += 1;
    } else {
      positionals.push(argument);
    }
  }
  return { options, positionals };
}

export function isGitConfigRead({ options, positionals }) {
  const readOption = options.some(
    (option) =>
      isLongOption(option, "get", 3) ||
      longOptionName(option)?.startsWith("get-") ||
      isLongOption(option, "list", 2) ||
      option === "-l",
  );
  const writeOption = options.some(
    (option) => option === "-e" || GIT_CONFIG_WRITE_OPTIONS.some((name) => isLongOption(option, name, 3)),
  );
  return readOption || GIT_CONFIG_READ_SUBCOMMANDS.has(positionals[0]) || (positionals.length === 1 && !writeOption);
}
