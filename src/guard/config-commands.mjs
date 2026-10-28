import { gitInvocation, isGitConfigRead, parseGitConfig } from "./git-args.mjs";

const COMMAND_KEYS =
  /^(core\.(pager|editor|sshcommand|fsmonitor|askpass|gitproxy|alternaterefscommand)|sequence\.editor|diff\.external|diff\..+\.(command|textconv)|merge\..+\.driver|filter\..+\.(clean|smudge|process)|credential(\..+)?\.helper|gpg(\..+)?\.program|pager\..+|interactive\.difffilter|uploadpack\.packobjectshook)$/i;
const CREDENTIAL_HELPER = /^credential(\..+)?\.helper$/i;
const COMMAND_VARIABLES = new Set([
  "GIT_PAGER",
  "PAGER",
  "GIT_EDITOR",
  "EDITOR",
  "VISUAL",
  "GIT_SEQUENCE_EDITOR",
  "GIT_SSH_COMMAND",
  "GIT_SSH",
  "GIT_ASKPASS",
  "SSH_ASKPASS",
  "GIT_EXTERNAL_DIFF",
  "GIT_PROXY_COMMAND",
]);

function splitEntry(entry) {
  const index = entry.indexOf("=");
  return index === -1 ? [entry, undefined] : [entry.slice(0, index), entry.slice(index + 1)];
}

function commandOf(key, value) {
  if (value === undefined || !COMMAND_KEYS.test(key)) return [];
  if (CREDENTIAL_HELPER.test(key) && !value.startsWith("!")) return [];
  return [{ source: key, script: CREDENTIAL_HELPER.test(key) ? value.slice(1) : value }];
}

export function environmentCommands(assignments) {
  return assignments.flatMap((assignment) => {
    const [name, value] = splitEntry(assignment);
    return COMMAND_VARIABLES.has(name.toUpperCase()) ? [{ source: name, script: value ?? "" }] : [];
  });
}

function configWrite(subcommand, rest) {
  if (subcommand !== "config") return [];
  const parsed = parseGitConfig(rest);
  if (isGitConfigRead(parsed)) return [];
  const [key, value] = parsed.positionals[0] === "set" ? parsed.positionals.slice(1) : parsed.positionals;
  return key === undefined ? [] : commandOf(key, value);
}

export function gitConfigCommands(args) {
  const { inlineConfig, envConfig, subcommand, rest } = gitInvocation(args);
  return [
    ...inlineConfig.flatMap((entry) => commandOf(...splitEntry(entry))),
    ...envConfig
      .map((entry) => splitEntry(entry)[0])
      .filter((key) => COMMAND_KEYS.test(key))
      .map((key) => ({ source: key, script: null })),
    ...configWrite(subcommand, rest),
  ];
}
