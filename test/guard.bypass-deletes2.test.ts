import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const io = { gitAlias: () => null, readTextFile: () => null };
const repoRoot = homedir().replace(/\\/g, "/") + "/repos/tcg";
const bash = (command: string) =>
  evaluateToolCall({ tool_name: "Bash", tool_input: { command }, cwd: repoRoot }, { repoRoot, io });
const powershell = (command: string) =>
  evaluateToolCall({ tool_name: "PowerShell", tool_input: { command }, cwd: repoRoot }, { repoRoot, io });

describe("recursive delete through extglob and POSIX classes", () => {
  it.each([
    "rm -rf ~/@(.*)",
    "rm -rf ~/+(.)",
    "rm -rf ~/!(keep)",
    "rm -rf ~/?(.*)",
    "rm -rf ~/*(.)",
    "rm -rf ~/[[:alpha:]]*",
    "rm -rf ~/[[:punct:]]*",
  ])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each(["rm -rf ~/.cache/@(a|b)", "rm -rf dist/+(a|b)", "rm -rf ~/.cache/[[:alpha:]]*", "rm -rf build/!(keep)"])(
    "allows %s",
    (command) => {
      expect(bash(command).block).toBe(false);
    },
  );
});

describe("recursive delete through a brace alternative that is the home folder", () => {
  it.each(["rm -rf {~,build}", "rm -rf {~/.ssh,build}", "rm -rf {build,~}"])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each(["rm -rf {dist,build}", "rm -rf {dist,coverage}/x"])("allows %s", (command) => {
    expect(bash(command).block).toBe(false);
  });
});

describe("recursive delete through a cygdrive or extended-length prefix", () => {
  it.each(["rm -rf /cygdrive/c/*", "rm -rf /cygdrive/d/*"])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it.each(["Remove-Item -Recurse \\\\?\\C:\\", "Remove-Item -Recurse -Force \\\\.\\C:\\"])(
    "blocks %s in powershell",
    (command) => {
      expect(powershell(command).block).toBe(true);
    },
  );

  it("allows a cygdrive path to a build directory", () => {
    expect(bash("rm -rf /cygdrive/c/Users/x/project/dist").block).toBe(false);
  });
});

describe("PowerShell remove parameters and unreadable targets", () => {
  it.each([
    "Remove-Item -Path:~\\.ssh -Recurse",
    "Remove-Item -LiteralPath:~ -Recurse",
    "Remove-Item -Recurse:$true ~",
    "Remove-Item -Recurse ~,build",
    "Remove-Item -Recurse @('~','build')",
    "ri -Recurse -Path:~ -Force",
  ])("blocks %s", (command) => {
    expect(powershell(command).block).toBe(true);
  });

  it.each([
    "Remove-Item -Path:dist -Recurse",
    "Remove-Item -LiteralPath:node_modules -Recurse",
    "Remove-Item -Recurse dist",
    "Remove-Item -Recurse:$true dist",
  ])("allows %s", (command) => {
    expect(powershell(command).block).toBe(false);
  });
});

describe("cmd glued recursive switch", () => {
  it.each(["rd /s/q ~", "del /s/q ~/.ssh"])("blocks %s", (command) => {
    expect(bash(command).block).toBe(true);
  });

  it("allows a glued switch on a build directory", () => {
    expect(bash("rd /s/q dist").block).toBe(false);
  });
});

describe("git rev-parse --show-toplevel resolves like the working directory", () => {
  it("allows a delete under the repository top level", () => {
    expect(bash('rm -rf "$(git rev-parse --show-toplevel)/dist"').block).toBe(false);
  });

  it("blocks a delete of the repository top level itself", () => {
    expect(bash('rm -rf "$(git rev-parse --show-toplevel)"').block).toBe(true);
  });
});

describe.runIf(process.platform === "win32")("home-based cygdrive on Windows", () => {
  const userDir = homedir()
    .replace(/\\/g, "/")
    .replace(/^([A-Za-z]):/, (_, d: string) => `/cygdrive/${d.toLowerCase()}`);
  it("blocks a cygdrive path that reaches the home folder", () => {
    expect(bash(`rm -rf ${userDir}/*`).block).toBe(true);
  });
});
