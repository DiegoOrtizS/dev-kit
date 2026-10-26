import { describe, expect, it } from "vitest";
import { evaluateToolCall } from "../src/guard/guard.mjs";

const bash = (command: string) => evaluateToolCall({ tool_name: "Bash", tool_input: { command } });

describe("in-place editors and other writers", () => {
  it.each([
    "sed -i 's/x/y/' .git/hooks/pre-commit",
    "sed -ni 's/x/y/' .git/hooks/pre-commit",
    "sed -i.bak -e 's/x/y/' .git/config",
    "sed --in-place=.bak 's/x/y/' ~/.gitconfig",
    "perl -pi -e 's/x/y/' .git/hooks/pre-push",
    "perl -i.bak -pe 's/x/y/' .git/config",
    "awk -i inplace '{print}' .git/hooks/pre-commit",
    "gawk --inplace '{print}' .git/hooks/pre-commit",
    "ln -sf /dev/null .git/hooks/pre-commit",
    "ln hook .git/hooks/pre-commit",
    "install -m 755 hook.sh .git/hooks/pre-commit",
    "dd if=/dev/null of=.git/hooks/pre-commit",
    "patch .git/hooks/pre-commit < x.diff",
    "patch -p0 .git/config",
    "tee -a .git/hooks/pre-commit",
  ])("asks before %s", (command) => {
    expect(bash(command)).toMatchObject({ block: false, ask: true });
  });

  it.each([
    "sed -n 1p .git/config",
    "sed -i 's/a/b/' src/x.ts",
    "sed -e 's/a/b/' .git/hooks/pre-commit",
    "perl -ne 'print' .git/config",
    "awk '{print}' .git/config",
    "ln -s a b",
    "install -d build",
    "dd if=x of=y",
    "patch -p1 < fix.diff",
    "tee build/log.txt",
  ])("allows %s", (command) => {
    expect(bash(command)).toEqual({ block: false });
  });

  it("still blocks an in-place editor that reads a .env file", () => {
    expect(bash("sed -i 's/a/b/' .env").block).toBe(true);
  });
});
