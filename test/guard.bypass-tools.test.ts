import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const bash = (command: string) => evaluateToolCall({ tool_name: "Bash", tool_input: { command } });
const monitor = (command: string) => evaluateToolCall({ tool_name: "Monitor", tool_input: { command } });
const token = ["ghp_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0"].join("");

describe("Monitor tool", () => {
  it.each([
    "git push -f origin main",
    "while true; do git push origin main; sleep 30; done",
    "tail -f x.log | grep --line-buffered ERROR; git push --force",
  ])("blocks %s", (command) => {
    expect(monitor(command).block).toBe(true);
  });

  it.each(["tail -f dev.log | grep --line-buffered ERROR", "while true; do gh pr checks 1; sleep 30; done"])(
    "allows %s",
    (command) => {
      expect(monitor(command).block).toBe(false);
    },
  );

  it("ignores a websocket monitor without a command", () => {
    expect(evaluateToolCall({ tool_name: "Monitor", tool_input: { ws: { url: "wss://x" } } }).block).toBe(false);
  });
});

describe("NotebookEdit sources", () => {
  it("blocks a secret written into a notebook cell", () => {
    const verdict = evaluateToolCall({
      tool_name: "NotebookEdit",
      tool_input: { notebook_path: "x.ipynb", new_source: `TOKEN = "${token}"` },
    });
    expect(verdict.block).toBe(true);
    expect(verdict.reason).toMatch(/github-token/);
  });

  it("allows an ordinary cell", () => {
    const verdict = evaluateToolCall({
      tool_name: "NotebookEdit",
      tool_input: { notebook_path: "x.ipynb", new_source: "import pandas as pd" },
    });
    expect(verdict.block).toBe(false);
  });
});

describe("tool coverage", () => {
  it("still allows an ordinary Bash command", () => {
    expect(bash("pnpm check").block).toBe(false);
  });
});
