import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

export function releasePlan(packageJsonText, lsRemoteOutput) {
  const { version } = JSON.parse(packageJsonText);
  if (typeof version !== "string" || !VERSION.test(version)) {
    throw new Error(`package.json version must be <major>.<minor>.<patch>, got ${JSON.stringify(version)}`);
  }
  const tag = `v${version}`;
  const refs = lsRemoteOutput
    .split(/\r?\n/)
    .map((line) => line.split("\t")[1] ?? "")
    .map((ref) => ref.replace(/\^\{\}$/, ""));
  return { tag, create: !refs.includes(`refs/tags/${tag}`) };
}

export function releaseTag(_config, _args, repoRoot = process.cwd()) {
  const packageJsonText = readFileSync(join(repoRoot, "package.json"), "utf8");
  const { version } = JSON.parse(packageJsonText);
  const lsRemote = execFileSync("git", ["ls-remote", "--tags", "origin", `refs/tags/v${String(version)}`], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const plan = releasePlan(packageJsonText, lsRemote);
  process.stdout.write(`tag=${plan.tag}\ncreate=${plan.create}\n`);
  return plan;
}
