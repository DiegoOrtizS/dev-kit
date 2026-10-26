import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const TYPES = ["feat", "fix", "docs", "chore", "refactor", "test", "ci", "build", "perf", "style", "revert"];
export const MAX_HEADER = 100;

const HEADER = /^([a-z]+)(?:\(([^()]*)\))?(!?):(.*)$/;
const SCOPE = /^[a-z0-9./-]+$/;
const EXEMPT = /^(Merge branch |Merge pull request #|Merge remote-tracking branch |Revert "|fixup! |squash! )/;
const DEPENDABOT = /dependabot/i;
const USAGE = 'usage: dev-kit check-commit <file> | --message "<text>" | --range <base>..<head>';

export function isExempt(header) {
  return EXEMPT.test(header);
}

export function isDependabot(name, email) {
  return DEPENDABOT.test(name) || DEPENDABOT.test(email);
}

export function headerOf(message, { stripComments = false } = {}) {
  const lines = message.split(/\r?\n/).filter((line) => !(stripComments && line.startsWith("#")));
  return (lines.find((line) => line.trim() !== "") ?? "").trim();
}

export function headerProblems(header) {
  const problems = [];
  if (header.length > MAX_HEADER) problems.push(`header is ${header.length} characters, max ${MAX_HEADER}`);
  const match = HEADER.exec(header);
  if (!match) return [...problems, `header must be <type>(scope)?!?: subject, with type one of ${TYPES.join(", ")}`];
  const [, type, scope, , rest] = match;
  if (!TYPES.includes(type)) problems.push(`unknown type "${type}", use one of ${TYPES.join(", ")}`);
  if (scope !== undefined && !SCOPE.test(scope)) problems.push(`scope "${scope}" must be lowercase [a-z0-9./-]+`);
  const subject = rest.startsWith(" ") ? rest.slice(1) : "";
  if (subject.trim() === "") problems.push("subject must follow the colon and one space, and must not be empty");
  else if (subject.endsWith(".")) problems.push("subject must not end with a period");
  return problems;
}

function messageProblems(header, { exempt }) {
  if (exempt && isExempt(header)) return [];
  const problems = headerProblems(header);
  return problems.length === 0 ? [] : [`${header}\n${problems.map((problem) => `  ${problem}`).join("\n")}`];
}

function rangeProblems(range, cwd) {
  const log = execFileSync("git", ["log", "--no-merges", "--format=%x1e%H%x1f%an%x1f%ae%x1f%B", range], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const problems = [];
  for (const record of log.split("\x1e").filter((part) => part.trim() !== "")) {
    const [sha, name, email, body] = record.split("\x1f");
    if (isDependabot(name, email)) continue;
    const header = headerOf(body);
    if (isExempt(header)) continue;
    const found = headerProblems(header);
    if (found.length > 0) problems.push(`${sha.slice(0, 7)} ${header}\n${found.map((p) => `  ${p}`).join("\n")}`);
  }
  return problems;
}

export function commitProblems(args, cwd) {
  const [mode, value, ...rest] = args;
  if (!mode || rest.length > 0) throw new Error(USAGE);
  if (mode === "--message") {
    if (value === undefined) throw new Error(USAGE);
    return messageProblems(headerOf(value), { exempt: false });
  }
  if (mode === "--range") {
    if (value === undefined || !value.includes("..")) throw new Error(USAGE);
    return rangeProblems(value, cwd);
  }
  if (mode.startsWith("--") || value !== undefined) throw new Error(USAGE);
  return messageProblems(headerOf(readFileSync(mode, "utf8"), { stripComments: true }), { exempt: true });
}

export function checkCommit(_config, args, repoRoot = process.cwd()) {
  let problems;
  try {
    problems = commitProblems(args, repoRoot);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
  if (problems.length === 0) return;
  process.stderr.write(
    `Commit message check failed:\n${problems.join("\n")}\nSee the dev-kit README, "Commit messages".\n`,
  );
  process.exit(1);
}
