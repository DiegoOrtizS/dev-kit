import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const kitRoot = path.resolve(__dirname, "..");
let consumer: string;

function installShim() {
  const hooks = path.join(consumer, "tools", "claude-hooks");
  mkdirSync(hooks, { recursive: true });
  copyFileSync(path.join(kitRoot, "shim", "guard.mjs"), path.join(hooks, "guard.mjs"));
  return path.join(hooks, "guard.mjs");
}

function installKit() {
  mkdirSync(path.join(consumer, "node_modules"));
  symlinkSync(kitRoot, path.join(consumer, "node_modules", "dev-kit"), "junction");
}

function runShim(shimPath: string, tool_name: string, command: string) {
  return spawnSync(process.execPath, [shimPath], {
    cwd: consumer,
    input: JSON.stringify({ tool_name, tool_input: { command }, cwd: consumer }),
    encoding: "utf8",
  });
}

beforeEach(() => {
  consumer = mkdtempSync(path.join(tmpdir(), "dev-kit-consumer-"));
});

afterEach(() => {
  rmSync(consumer, { recursive: true, force: true });
});

describe("guard shim without dev-kit installed", () => {
  it("fails closed", () => {
    const result = runShim(installShim(), "Bash", "ls");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("pnpm install");
  });

  it.each(["pnpm install", "pnpm i", "pnpm install --frozen-lockfile"])("lets %s bootstrap the kit", (command) => {
    expect(runShim(installShim(), "Bash", command).status).toBe(0);
  });

  it.each(["pnpm install && git push origin main", "pnpm install; rm -rf ."])("does not let %s through", (command) => {
    expect(runShim(installShim(), "Bash", command).status).toBe(2);
  });
});

describe("guard shim with dev-kit installed", () => {
  it("blocks a push to main", () => {
    const shim = installShim();
    installKit();
    const result = runShim(shim, "Bash", "git push origin main");
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("main");
  });

  it("allows an ordinary command", () => {
    const shim = installShim();
    installKit();
    expect(runShim(shim, "Bash", "git status").status).toBe(0);
  });
});
