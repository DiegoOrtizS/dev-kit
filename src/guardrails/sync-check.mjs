import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHIMS = ["guard.mjs", "lint-after-edit.mjs"];
const POLICY_FIELDS = ["model", "effort", "maxTurns", "tools"];
const CLAUDE_MD_PATHS = ["CLAUDE.md", ".claude/CLAUDE.md"];
const FIRST_SECTIONS = [
  ["Never", "Prohibido"],
  ["Where to write", "Dónde se escribe"],
];

function readText(path) {
  return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
}

export function parseFrontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, "\n"));
  if (!match) return {};
  return Object.fromEntries(
    match[1]
      .split("\n")
      .map((line) => /^([A-Za-z]+):\s*(.*)$/.exec(line))
      .filter(Boolean)
      .map(([, key, value]) => [key, value.trim()]),
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

export function checkAgents(repoRoot, overrides) {
  const agentsDir = join(repoRoot, ".claude", "agents");
  if (!existsSync(agentsDir)) return [];
  const templatesDir = join(KIT_ROOT, "templates", "agents");
  return readdirSync(templatesDir)
    .filter((file) => existsSync(join(agentsDir, file)))
    .flatMap((file) => {
      const name = file.replace(/\.md$/, "");
      const template = parseFrontmatter(readText(join(templatesDir, file)));
      const agent = parseFrontmatter(readText(join(agentsDir, file)));
      const allowed = new Set(overrides[name] ?? []);
      return POLICY_FIELDS.filter((field) => !allowed.has(field))
        .filter((field) => normalizeField(field, template[field]) !== normalizeField(field, agent[field]))
        .map(
          (field) =>
            `.claude/agents/${file}: ${field} is "${agent[field] ?? "(missing)"}", template has "${template[field] ?? "(missing)"}"`,
        );
    });
}

export function checkClaudeMd(repoRoot) {
  const relative = CLAUDE_MD_PATHS.find((path) => existsSync(join(repoRoot, path)));
  if (!relative) return ["CLAUDE.md: missing"];
  const headings = [...readText(join(repoRoot, relative)).matchAll(/^## (.+)$/gm)].map(([, heading]) => heading.trim());
  return FIRST_SECTIONS.flatMap((accepted, index) =>
    accepted.includes(headings[index] ?? "")
      ? []
      : [
          `${relative}: section ${index + 1} must be "${accepted.join('" or "')}", found "${headings[index] ?? "(none)"}"`,
        ],
  );
}

export function syncProblems(repoRoot, config) {
  return [
    ...checkShims(repoRoot),
    ...checkAgents(repoRoot, config.syncCheck.agentOverrides),
    ...checkClaudeMd(repoRoot),
  ];
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
