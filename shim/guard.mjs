import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BOOTSTRAP = /^\s*pnpm\s+(install|i)(\s+--frozen-lockfile)?\s*$/;

function allowsBootstrap() {
  try {
    const payload = JSON.parse(readFileSync(0, "utf8"));
    const command = payload?.tool_input?.command;
    return (
      ["Bash", "PowerShell"].includes(payload?.tool_name) && typeof command === "string" && BOOTSTRAP.test(command)
    );
  } catch {
    return false;
  }
}

function block(message) {
  process.stderr.write(`Blocked: ${message}\n`);
  process.exit(2);
}

let guard;
try {
  guard = await import("dev-kit/guard");
} catch {
  if (allowsBootstrap()) process.exit(0);
  block("dev-kit is not installed, so the guard cannot run. Run pnpm install first.");
}
if (typeof guard.runGuard !== "function") block("the installed dev-kit has no runGuard. Reinstall it.");
try {
  guard.runGuard({ repoRoot });
} catch (error) {
  block(`the guard failed (${error instanceof Error ? error.message : "unknown error"}).`);
}
