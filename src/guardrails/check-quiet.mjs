import { spawnSync } from "node:child_process";

const FAILURE_TAIL_LINES = 40;
const ANSI = /\u001b\[[0-9;]*m/g;

function run(command) {
  const startedAt = Date.now();
  const result = spawnSync(command, { shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replace(ANSI, "");
  return { ok: result.status === 0, output, seconds: ((Date.now() - startedAt) / 1000).toFixed(1) };
}

function tail(output) {
  return output.trimEnd().split("\n").slice(-FAILURE_TAIL_LINES).join("\n");
}

export function checkQuiet(config, requested) {
  const selected = requested.length === 0 ? config.checks : config.checks.filter(([name]) => requested.includes(name));
  for (const [name, command] of selected) {
    const { ok, output, seconds } = run(command);
    if (!ok) {
      process.stdout.write(`FAIL ${name} (${seconds}s)\n${tail(output)}\n`);
      process.exit(1);
    }
    process.stdout.write(`ok ${name} (${seconds}s)\n`);
  }
}
