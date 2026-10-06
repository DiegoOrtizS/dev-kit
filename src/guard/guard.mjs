import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadConfig, normalizeConfig } from "../config.mjs";
import { findSecrets } from "../guardrails/rules.mjs";
import { BASH, POWERSHELL, commandName, scriptFromShell } from "./dialects.mjs";
import { checkFileAccess, matchesBlockedPath } from "./env-files.mjs";
import { checkGh } from "./gh.mjs";
import { checkAssignments, checkGit } from "./git.mjs";
import { REMOVE_COMMANDS, checkRemove } from "./remove.mjs";
import { asAssignment, splitSegments, stripPrefixes } from "./segments.mjs";
import { ALLOW, deny, firstBlock } from "./verdict.mjs";

const SCRIPT_TOOLS = new Set(["Bash", "PowerShell"]);
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

const ENV_EXPORTERS = new Set(["export", "declare", "typeset", "readonly", "local"]);

function checkFindExec(args, context) {
  const verdicts = [];
  for (let i = 0; i < args.length; i += 1) {
    if (!["-exec", "-execdir", "-ok", "-okdir"].includes(args[i])) continue;
    const end = args.findIndex((argument, index) => index > i && (argument === ";" || argument === "+"));
    verdicts.push(checkWords(args.slice(i + 1, end === -1 ? args.length : end), context));
  }
  return firstBlock(verdicts);
}

function checkWords(words, context) {
  const { assignments, rest } = stripPrefixes(words);
  const assignmentVerdict = checkAssignments(assignments);
  if (assignmentVerdict.block || rest.length === 0) return assignmentVerdict;
  const [command, ...args] = rest;
  const name = commandName(command);
  if (ENV_EXPORTERS.has(name)) return checkAssignments(args.map(asAssignment).filter(Boolean));
  const nested = scriptFromShell(name, args);
  if (nested !== null) return checkScript(nested.script, context, nested.dialect);
  if (name === "eval") return checkScript(args.join(" "), context);
  return firstBlock([
    name === "git" ? checkGit(args, context) : ALLOW,
    name === "gh" ? checkGh(args) : ALLOW,
    name === "find" ? checkFindExec(args, context) : ALLOW,
    checkFileAccess(name, args, context),
    REMOVE_COMMANDS.has(name) ? checkRemove(name, args, context) : ALLOW,
  ]);
}

function checkScript(script, context, dialect = BASH) {
  const { segments, stdinScripts } = splitSegments(script, dialect);
  return firstBlock([
    ...segments.map((words) => checkWords(words, context)),
    ...stdinScripts.map((stdin) => checkScript(stdin.script, context, stdin.dialect)),
  ]);
}

function collectWrittenText(toolName, toolInput) {
  if (toolName === "Write") return [toolInput.content];
  if (toolName === "Edit") return [toolInput.new_string];
  if (toolName === "MultiEdit" && Array.isArray(toolInput.edits)) {
    return toolInput.edits.map((edit) => edit?.new_string);
  }
  return [];
}

function checkWrittenText(toolName, toolInput) {
  for (const text of collectWrittenText(toolName, toolInput)) {
    if (typeof text !== "string") continue;
    const [finding] = findSecrets(text);
    if (finding) {
      return deny(
        `Blocked: the content looks like a secret (${finding.rule}, line ${finding.line}). Keep secrets in the platform's secret store and environment variables, never in the repository.`,
      );
    }
  }
  return ALLOW;
}

function checkFilePath(toolName, input, context) {
  const path = input.file_path ?? input.notebook_path;
  if (typeof path !== "string") return ALLOW;
  const { blockedPaths } = context.config;
  if (WRITE_TOOLS.has(toolName) && matchesBlockedPath(path, blockedPaths.write, context)) {
    return deny("Blocked: this path is off limits for writing in this repository (.claude/guard.json).");
  }
  if (toolName === "Read" && matchesBlockedPath(path, blockedPaths.read, context)) {
    return deny("Blocked: this path is off limits for reading in this repository (.claude/guard.json).");
  }
  return ALLOW;
}

export function evaluateToolCall({ tool_name: toolName, tool_input: toolInput, cwd }, options = {}) {
  const input = toolInput && typeof toolInput === "object" ? toolInput : {};
  const workingDirectory = cwd ?? process.cwd();
  const context = {
    cwd: workingDirectory,
    repoRoot: options.repoRoot ?? workingDirectory,
    config: options.config ?? normalizeConfig(),
  };
  if (SCRIPT_TOOLS.has(toolName)) {
    return typeof input.command === "string"
      ? checkScript(input.command, context, toolName === "PowerShell" ? POWERSHELL : BASH)
      : ALLOW;
  }
  return firstBlock([checkFilePath(toolName, input, context), checkWrittenText(toolName, input)]);
}

function failClosed(reason) {
  process.stderr.write(`Blocked: ${reason}\n`);
  process.exit(2);
}

function readPayload() {
  let raw;
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    return failClosed("could not read the hook input");
  }
  if (raw.trim() === "") return failClosed("the hook input was empty");
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return failClosed("the hook input was not valid JSON");
  }
  if (payload === null || typeof payload !== "object" || typeof payload.tool_name !== "string") {
    return failClosed("the hook input had no tool_name");
  }
  return payload;
}

function describe(error) {
  return error instanceof Error ? error.message : "unknown error";
}

export function runGuard({ repoRoot }) {
  const payload = readPayload();
  let config;
  try {
    config = loadConfig(repoRoot);
  } catch (error) {
    return failClosed(`could not read .claude/guard.json (${describe(error)})`);
  }
  let verdict;
  try {
    verdict = evaluateToolCall(payload, { repoRoot, config });
  } catch (error) {
    return failClosed(`the guard failed internally (${describe(error)})`);
  }
  if (verdict.block) {
    process.stderr.write(`${verdict.reason}\n`);
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runGuard({ repoRoot: resolve(dirname(fileURLToPath(import.meta.url)), "..", "..") });
}
