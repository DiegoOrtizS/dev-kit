import { CMD, POWERSHELL } from "./dialects.mjs";

const POWERSHELL_ENV_SETTERS = new Set(["set-item", "si", "new-item", "ni", "set-content", "sc"]);
const ENV_DRIVE_ITEM = /^env:\\?([A-Za-z_]\w*)$/i;
const SET_ENVIRONMENT_VARIABLE = /SetEnvironmentVariable\s*\(\s*["']?([A-Za-z_]\w*)["']?\s*,\s*["']?([^"',)]*)/gi;

function powershellEnvAssignment(args) {
  const index = args.findIndex((argument) => ENV_DRIVE_ITEM.test(argument));
  if (index === -1) return [];
  const [, variable] = ENV_DRIVE_ITEM.exec(args[index]);
  const valueFlag = args.findIndex((argument) => /^-val(ue)?$/i.test(argument));
  const value =
    valueFlag === -1 ? args.slice(index + 1).find((argument) => !argument.startsWith("-")) : args[valueFlag + 1];
  return [`${variable}=${value ?? ""}`];
}

export function setterAssignments(name, args, dialect) {
  if (dialect === CMD && name === "set") return args.length > 1 || args[0]?.includes("=") ? [args.join("=")] : [];
  if (dialect === POWERSHELL && POWERSHELL_ENV_SETTERS.has(name)) return powershellEnvAssignment(args);
  return null;
}

export function environmentCalls(script, dialect) {
  if (dialect !== POWERSHELL) return [];
  return [...script.matchAll(SET_ENVIRONMENT_VARIABLE)].map(([, variable, value]) => `${variable}=${value.trim()}`);
}
