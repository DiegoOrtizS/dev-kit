import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHIMS = ["guard.mjs", "lint-after-edit.mjs"];
export const POLICY_FIELDS = ["model", "effort", "maxTurns", "tools"];
const CLAUDE_MD_PATHS = ["CLAUDE.md", ".claude/CLAUDE.md"];
const FIRST_SECTIONS = [
  ["Never", "Prohibido"],
  ["Where to write", "Dónde se escribe"],
];

function readText(path) {
  return readFileSync(path, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
}

function cleanValue(raw) {
  const value = raw.replace(/\s+#.*$/, "").trim();
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? quoted[2] : value;
}

export function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text.replace(/^﻿/, "").replace(/\r\n/g, "\n"));
  if (!match) return {};
  return Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => /^([A-Za-z]+):\s*(.*)$/.exec(line))
      .filter(Boolean)
      .map(([, key, value]) => [key, cleanValue(value)]),
  );
}

function normalizeField(field, value) {
  if (value === undefined) return undefined;
  if (field !== "tools") return value;
  return value
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean)
    .sort()
    .join(", ");
}

export function checkShims(repoRoot) {
  return SHIMS.flatMap((name) => {
    const path = join(repoRoot, "tools", "claude-hooks", name);
    if (!existsSync(path)) return [`tools/claude-hooks/${name}: missing; copy it from dev-kit/shim/${name}`];
    return readText(path) === readText(join(KIT_ROOT, "shim", name))
      ? []
      : [`tools/claude-hooks/${name}: differs from dev-kit/shim/${name}; copy the kit version`];
  });
}

function templatePolicy(file) {
  const policy = parseFrontmatter(readText(join(KIT_ROOT, "templates", "agents", file)));
  if (!POLICY_FIELDS.some((field) => policy[field] !== undefined)) {
    throw new Error(`dev-kit template ${file} has no policy frontmatter`);
  }
  return policy;
}

function agentDrift(agentsDir, file, overrides) {
  const name = file.replace(/\.md$/, "");
  const template = templatePolicy(file);
  const agent = parseFrontmatter(readText(join(agentsDir, file)));
  const allowed = new Set(Object.hasOwn(overrides, name) ? overrides[name] : []);
  return POLICY_FIELDS.filter((field) => !allowed.has(field))
    .filter((field) => normalizeField(field, template[field]) !== normalizeField(field, agent[field]))
    .map(
      (field) =>
        `.claude/agents/${file}: ${field} is "${agent[field] ?? "(missing)"}", template has "${template[field] ?? "(missing)"}"`,
    );
}

export function checkAgents(repoRoot, { agentOverrides = {}, requiredAgents = [] } = {}) {
  const agentsDir = join(repoRoot, ".claude", "agents");
  const templates = readdirSync(join(KIT_ROOT, "templates", "agents"));
  const missing = requiredAgents
    .filter((name) => !existsSync(join(agentsDir, `${name}.md`)))
    .map((name) => `.claude/agents/${name}.md: required by guard.json syncCheck.requiredAgents but missing`);
  if (!existsSync(agentsDir)) return missing;
  const drift = templates
    .filter((file) => existsSync(join(agentsDir, file)))
    .flatMap((file) => agentDrift(agentsDir, file, agentOverrides));
  return [...missing, ...drift];
}

function headingsOutsideCode(text) {
  return [...text.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").matchAll(/^## (.+)$/gm)].map(([, heading]) => heading.trim());
}

function checkSections(relative, headings) {
  return FIRST_SECTIONS.flatMap((accepted, index) =>
    accepted.includes(headings[index] ?? "")
      ? []
      : [
          `${relative}: section ${index + 1} must be "${accepted.join('" or "')}", found "${headings[index] ?? "(none)"}"`,
        ],
  );
}

export function checkClaudeMd(repoRoot) {
  const present = CLAUDE_MD_PATHS.filter((path) => existsSync(join(repoRoot, path)));
  if (present.length === 0) return ["CLAUDE.md: missing"];
  return present.flatMap((relative) =>
    checkSections(relative, headingsOutsideCode(readText(join(repoRoot, relative)))),
  );
}

export function syncProblems(repoRoot, config) {
  return [...checkShims(repoRoot), ...checkAgents(repoRoot, config.syncCheck), ...checkClaudeMd(repoRoot)];
}

export function syncCheck(config, _args, repoRoot = process.cwd()) {
  const problems = syncProblems(repoRoot, config);
  for (const problem of problems) process.stdout.write(`${problem}\n`);
  if (problems.length > 0) {
    process.stderr.write(
      "Out of sync with dev-kit. Fix the files, or record a deliberate agent difference in .claude/guard.json syncCheck.agentOverrides.\n",
    );
    process.exit(1);
  }
  process.stdout.write("in sync with dev-kit\n");
}
