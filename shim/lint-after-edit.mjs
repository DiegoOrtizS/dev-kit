import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

let hooks;
try {
  hooks = await import("dev-kit/lint-after-edit");
} catch {
  process.exit(0);
}
hooks.runLintAfterEdit({ repoRoot });
