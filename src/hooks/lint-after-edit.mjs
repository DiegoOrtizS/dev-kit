import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadConfig } from "../config.mjs";

const LINT_TIMEOUT_MS = 60_000;
const GENERATED_FOLDERS = new Set(["node_modules", ".next", ".astro", "dist", "__pycache__"]);

function readPayload() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

function resolveInsideRepo(filePath, cwd, repoRoot) {
  const absolute = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  const fromRoot = relative(repoRoot, absolute);
  const outside = fromRoot === "" || fromRoot.startsWith("..") || isAbsolute(fromRoot);
  const generated = fromRoot.split(/[\\/]/).some((part) => GENERATED_FOLDERS.has(part));
  return outside || generated ? null : absolute;
}

function isFile(path) {
  return existsSync(path) && statSync(path).isFile();
}

function buildCommand(command, target, repoRoot) {
  const [executable, ...args] = command.map((part) => part.replaceAll("{file}", target));
  if (executable !== "node") return { executable, args };
  if (args[0] && !isAbsolute(args[0]) && !existsSync(join(repoRoot, args[0]))) return null;
  return { executable: process.execPath, args };
}

function lint(repoRoot, payload) {
  const filePath = payload?.tool_input?.file_path;
  if (typeof filePath !== "string") return 0;
  const target = resolveInsideRepo(filePath, payload.cwd ?? repoRoot, repoRoot);
  if (!target || !isFile(target)) return 0;
  const fromRoot = relative(repoRoot, target).replace(/\\/g, "/");
  const rule = loadConfig(repoRoot).lint.find(({ match }) => match.test(fromRoot));
  if (!rule) return 0;
  const command = buildCommand(rule.command, target, repoRoot);
  if (!command) return 0;
  const result = spawnSync(command.executable, command.args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: LINT_TIMEOUT_MS,
  });
  if (result.error) {
    process.stderr.write(`lint-after-edit: the linter did not finish (${result.error.message})\n`);
    return 0;
  }
  if (result.status === 0) return 0;
  process.stderr.write(`The linter reported problems in ${fromRoot}:\n${result.stdout}${result.stderr}`);
  return 2;
}

export function runLintAfterEdit({ repoRoot }) {
  let code;
  try {
    code = lint(repoRoot, readPayload());
  } catch {
    code = 0;
  }
  process.exit(code);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLintAfterEdit({ repoRoot: resolve(dirname(fileURLToPath(import.meta.url)), "..", "..") });
}
