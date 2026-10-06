#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { loadConfig } from "../src/config.mjs";
import { checkBranch } from "../src/guardrails/check-branch.mjs";
import { checkQuiet } from "../src/guardrails/check-quiet.mjs";
import { scanSecrets } from "../src/guardrails/scan-secrets.mjs";
import { worktreesClean } from "../src/guardrails/worktrees-clean.mjs";

const COMMANDS = {
  "scan-secrets": scanSecrets,
  "check-branch": checkBranch,
  "check-quiet": checkQuiet,
  "worktrees-clean": worktreesClean,
};

const [name, ...args] = process.argv.slice(2);
const command = COMMANDS[name];
if (!command) {
  process.stderr.write(`usage: dev-kit <${Object.keys(COMMANDS).join("|")}> [options]\n`);
  process.exit(2);
}

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
command(loadConfig(repoRoot), args);
