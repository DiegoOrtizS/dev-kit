import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { expandHome } from "./remove.mjs";

const MAX_TEXT_BYTES = 8 * 1024 * 1024;
const GIT_TIMEOUT_MS = 5000;

export function toFileSystemPath(path, cwd) {
  const expanded = expandHome(path);
  const drive = process.platform === "win32" ? expanded.replace(/^\/([A-Za-z])(?=\/|$)/, "$1:") : expanded;
  return resolve(cwd, drive);
}

export function readTextFile(path) {
  try {
    const stats = statSync(path);
    return stats.isFile() && stats.size <= MAX_TEXT_BYTES ? readFileSync(path, "utf8") : null;
  } catch {
    return null;
  }
}

export function gitAlias(name, { cwd, gitArgs, deadline }) {
  const remaining = deadline === undefined ? GIT_TIMEOUT_MS : Math.max(1, deadline - Date.now());
  const result = spawnSync("git", [...gitArgs, "config", "--get", `alias.${name}`], {
    cwd,
    encoding: "utf8",
    timeout: Math.min(GIT_TIMEOUT_MS, remaining),
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status === 0) return result.stdout.replace(/\r?\n$/, "");
  if (result.status === 1 && result.stdout === "") return null;
  throw new Error(`git config exited with ${String(result.status)}`);
}

export function guardIo(overrides = {}) {
  return { readTextFile, gitAlias, ...overrides };
}
