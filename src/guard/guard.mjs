import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadConfig, normalizeConfig } from "../config.mjs";
import { ENV_EXPORTERS, launchedWords, reanchored } from "./anchors.mjs";
import { BASH, POWERSHELL, commandName, scriptFromShell } from "./dialects.mjs";
import { checkFileAccess, checkWrittenPaths } from "./env-files.mjs";
import { environmentCalls, setterAssignments } from "./env-setters.mjs";
import { findDeleteTargets } from "./find.mjs";
import { checkGh } from "./gh.mjs";
import { SHELL_ALIAS_WITH_ARGUMENTS, expandGitAlias } from "./git-alias.mjs";
import { environmentCommands, gitConfigCommands } from "./config-commands.mjs";
import { checkDotNetFileCalls, checkInlineCode } from "./interpreters.mjs";
import { HIDDEN_COMMAND, aliasDefinitions, hidesCommand } from "./shell-aliases.mjs";
import { guardIo } from "./io.mjs";
import { checkPatchCommand } from "./patches.mjs";
import { checkPipes } from "./pipes.mjs";
import { checkAssignments, checkGit } from "./git.mjs";
import { REMOVE_COMMANDS, checkDeleteAfterChdir, checkRemove } from "./remove.mjs";
import { asAssignment, stripPrefixes } from "./prefixes.mjs";
import { splitSegments } from "./segments.mjs";
import { checkSst } from "./sst.mjs";
import { isDynamic, isDynamicCommand, segmentInputs, stdinScripts, unreadableScript } from "./stdin.mjs";
import { ALLOW, deny, firstBlock } from "./verdict.mjs";
import { checkFileTool } from "./write-tools.mjs";

const SCRIPT_TOOLS = new Set(["Bash", "PowerShell", "Monitor"]);

function checkFindExec(args, context, dialect) {
  const verdicts = [];
  for (let i = 0; i < args.length; i += 1) {
    if (!["-exec", "-execdir", "-ok", "-okdir"].includes(args[i])) continue;
    const end = args.findIndex((argument, index) => index > i && (argument === ";" || argument === "+"));
    verdicts.push(checkWords(args.slice(i + 1, end === -1 ? args.length : end), context, dialect));
  }
  verdicts.push(checkRemove("find", ["-r", ...findDeleteTargets(args)], context));
  return firstBlock(verdicts);
}

function checkConfiguredCommands(commands, context) {
  return firstBlock(
    commands.map(({ source, script }) =>
      script === null || /[$`]/.test(script) ? unreadableScript(source) : checkScript(script, context, BASH),
    ),
  );
}

function checkEnvironment(assignments, context) {
  return firstBlock([
    checkAssignments(assignments),
    checkConfiguredCommands(environmentCommands(assignments), context),
  ]);
}

function checkGitAlias(alias, context, dialect, input) {
  if ("verdict" in alias) return alias.verdict;
  if ("args" in alias) return checkWords(["git", ...alias.args], context, dialect, input);
  const verdict = checkScript(alias.script, { ...context, cwd: context.repoRoot }, BASH);
  return firstBlock([verdict, alias.dynamic ? SHELL_ALIAS_WITH_ARGUMENTS : ALLOW]);
}

function checkWords(words, context, dialect = BASH, input = undefined) {
  const { assignments, rest } = stripPrefixes(words);
  return firstBlock([
    checkEnvironment(assignments, context),
    rest.length === 0 ? ALLOW : checkCommand(rest, context, dialect, input),
  ]);
}

function checkCommand(rest, context, dialect, input) {
  const [command, ...args] = rest;
  if (isDynamicCommand(command, args, dialect)) return unreadableScript(command);
  const name = commandName(command);
  const definitions = aliasDefinitions(name, args, dialect);
  if (definitions.length > 0) {
    if (hidesCommand(definitions)) return HIDDEN_COMMAND;
    return firstBlock(definitions.map((text) => checkScript(text, context, dialect)));
  }
  const launched = launchedWords(name, args);
  if (launched !== null) return checkWords(launched, context, dialect, input);
  const wrapped = reanchored(rest, dialect);
  if (wrapped !== null) return checkWords(wrapped, context, dialect, input);
  if (ENV_EXPORTERS.has(name)) return checkEnvironment(args.map(asAssignment).filter(Boolean), context);
  const setters = setterAssignments(name, args, dialect);
  if (setters !== null && setters.length > 0) return checkEnvironment(setters, context);
  const nested = scriptFromShell(name, args);
  if (nested !== null) {
    return isDynamic(nested.script) ? unreadableScript(name) : checkScript(nested.script, context, nested.dialect);
  }
  if (name === "eval") {
    return isDynamic(args.join(" ")) ? unreadableScript(name) : checkScript(args.join(" "), context, dialect);
  }
  const alias = name === "git" ? expandGitAlias(args, context) : null;
  if (alias !== null) return checkGitAlias(alias, context, dialect, input);
  if (name === "lefthook" && args.includes("uninstall")) {
    return deny("Blocked: lefthook uninstall removes the git hooks.");
  }
  return firstBlock([
    name === "git" ? checkGit(args, context, input) : ALLOW,
    name === "git" ? checkConfiguredCommands(gitConfigCommands(args), context) : ALLOW,
    name === "patch" ? checkPatchCommand(args, context, input) : ALLOW,
    name === "gh" ? checkGh(args) : ALLOW,
    name === "find" ? checkFindExec(args, context, dialect) : ALLOW,
    checkSst(rest),
    checkFileAccess(name, args, context),
    REMOVE_COMMANDS.has(name) ? checkRemove(name, args, context) : ALLOW,
    checkInlineCode(name, args),
  ]);
}

function checkScript(script, context, dialect = BASH) {
  const found = splitSegments(script, dialect);
  const stdin = stdinScripts(found, dialect);
  const inputs = segmentInputs(found, dialect);
  return firstBlock([
    checkEnvironment(environmentCalls(script, dialect), context),
    checkDotNetFileCalls(script, dialect),
    ...found.segments.map((words) => checkWords(words, context, dialect, inputs.get(words))),
    ...stdin.scripts.map((fed) => checkScript(fed.script, context, fed.dialect)),
    ...stdin.opaque.map(unreadableScript),
    checkPipes(found.pipes, context),
    checkWrittenPaths(found.written, context),
    checkDeleteAfterChdir(found.segments),
  ]);
}

export function evaluateToolCall({ tool_name: toolName, tool_input: toolInput, cwd }, options = {}) {
  const input = toolInput && typeof toolInput === "object" ? toolInput : {};
  const workingDirectory = cwd ?? process.cwd();
  const context = {
    cwd: workingDirectory,
    repoRoot: options.repoRoot ?? workingDirectory,
    config: options.config ?? normalizeConfig(),
    io: guardIo(options.io),
  };
  if (SCRIPT_TOOLS.has(toolName)) {
    return typeof input.command === "string"
      ? checkScript(input.command, context, toolName === "PowerShell" ? POWERSHELL : BASH)
      : ALLOW;
  }
  return checkFileTool(toolName, input, context);
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
  if (verdict.ask) {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: verdict.reason,
        },
      })}\n`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runGuard({ repoRoot: resolve(dirname(fileURLToPath(import.meta.url)), "..", "..") });
}
