# dev-kit

Shared tooling for my personal repositories: a guard for Claude Code agents, git guardrails (secret scan, protected branches, worktree cleanup) and an ESLint rule. It started as duplicated `tools/` folders in three repos, two in TypeScript and one in Python, that kept drifting apart.

The guard is how an agent holds itself back. It is **not a security boundary**: it stops honest mistakes and casual bypasses, not someone who sets out to defeat it.

## What is inside

| Piece                                                                  | Entry                                            | Used by                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| Claude Code `PreToolUse` guard                                         | `dev-kit/guard` (`runGuard`, `evaluateToolCall`) | any repo, any language                      |
| Claude Code `PostToolUse` lint                                         | `dev-kit/lint-after-edit` (`runLintAfterEdit`)   | any repo; the linter is configured per repo |
| Secret scan, branch policy, quiet checks, worktree cleanup, sync check | `dev-kit` bin                                    | any repo with git and Node                  |
| `no-comments` ESLint rule                                              | `dev-kit/eslint`                                 | TypeScript repos (ESLint 9 or 10)           |
| Secret patterns                                                        | `dev-kit/secrets`                                | anything that wants the same list           |

The package exports runnable tools and configuration, not domain libraries. A Python repo uses it only as dev tooling and never imports it at runtime.

## Install

```sh
pnpm add -D --save-exact github:DiegoOrtizS/dev-kit#v0.2.0
```

Pin a tag. Dependabot does not update git dependencies, so a kit upgrade is a manual PR in each consumer that bumps the tag.

The package has no lifecycle scripts (`prepare`, `postinstall`), so pnpm installs it without any build approval. Keep it that way.

## Wire the Claude Code hooks

Each consumer keeps two shims at stable paths, so `.claude/settings.json` never has to change when the kit moves. Copy them from `shim/`:

```
tools/claude-hooks/guard.mjs           <- shim/guard.mjs
tools/claude-hooks/lint-after-edit.mjs <- shim/lint-after-edit.mjs
```

```json
"hooks": {
  "PreToolUse": [
    {
      "matcher": "Bash|PowerShell|Write|Edit|MultiEdit|NotebookEdit",
      "hooks": [{ "type": "command", "command": "node \"$(git rev-parse --show-toplevel)/tools/claude-hooks/guard.mjs\" || exit 2" }]
    }
  ],
  "PostToolUse": [
    {
      "matcher": "Write|Edit|MultiEdit",
      "hooks": [{ "type": "command", "command": "node \"$(git rev-parse --show-toplevel)/tools/claude-hooks/lint-after-edit.mjs\" || exit 2" }]
    }
  ]
}
```

Add `Read` to the `PreToolUse` matcher if the repo uses `blockedPaths.read`.

**The guard shim fails closed.** In a fresh worktree without `node_modules`, every guarded call is blocked with "run pnpm install", and the only call it lets through is a plain `pnpm install` (optionally `--frozen-lockfile`) so the worktree can bootstrap itself. The lint shim fails open: a missing linter must not block editing.

## Configure per repository

Everything that differs between repositories lives in `.claude/guard.json`. Every field is optional. Patterns are regular expressions matched against paths relative to the repository root, using forward slashes.

```json
{
  "protectedBranches": {
    "main": { "allowedPaths": ["^docs/", "\\.md$"], "allowMerges": false, "blockAgentPush": true },
    "develop": { "allowedPaths": ["^docs/"], "allowMerges": true, "blockAgentPush": false }
  },
  "blockedPaths": {
    "read": ["^profile_[^/]*/"],
    "write": ["^profile_[^/]*/", "^state/"],
    "commit": ["(^|/)\\.env$", "^state/"]
  },
  "secretScan": { "skipFiles": ["pnpm-lock.yaml"] },
  "lint": [
    {
      "match": "\\.(ts|tsx|mjs|cjs)$",
      "command": [
        "node",
        "node_modules/eslint/bin/eslint.js",
        "--max-warnings=0",
        "--no-warn-ignored",
        "--no-color",
        "{file}"
      ]
    },
    { "match": "\\.py$", "command": ["python", "-m", "ruff", "check", "{file}"] }
  ],
  "checks": [
    ["typecheck", "pnpm typecheck"],
    ["test", "pnpm test"]
  ],
  "worktrees": { "base": "origin/develop" }
}
```

| Field                 | Default                                          | Meaning                                                                                                                                                                              |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `protectedBranches`   | `main` only, nothing allowed, agent push blocked | `allowedPaths`: what may be committed or pushed directly. `allowMerges`: merge commits skip the path check (gitflow). `blockAgentPush`: the guard refuses `git push` to that branch. |
| `blockedPaths.read`   | none                                             | Paths the agent may not read (shell readers, `cp`/`mv` sources, the Read tool).                                                                                                      |
| `blockedPaths.write`  | none                                             | Paths the agent may not write (Write/Edit tools, `cp`/`mv` destinations).                                                                                                            |
| `blockedPaths.commit` | none                                             | Paths that `scan-secrets` refuses to commit.                                                                                                                                         |
| `lint`                | none                                             | First rule whose `match` fits the edited file runs. `{file}` is the file path; a leading `node` runs the current Node binary and is skipped when its script is missing.              |
| `checks`              | format, lint, typecheck, test via pnpm           | Steps for `dev-kit check-quiet`.                                                                                                                                                     |
| `worktrees.base`      | `origin/main`                                    | Branch that `worktrees-clean` treats as merged.                                                                                                                                      |

The config can only tighten `main`: it is always protected and agent pushes to it are always blocked. A config with the wrong shape or an unknown key is an error, and the guard then blocks every call until it is fixed. A typo never turns protection off silently. On Windows, paths are compared case-insensitively and Git Bash (`/c/...`) and `~` forms are resolved.

The guard always blocks these, whatever the config says: force pushes, `--all`/`--mirror` pushes, skipped or redirected hooks, `git reset --hard`, `git clean -f`, reading `.env` files, `gh auth login|refresh|token`, `gh repo delete`, mutating `gh api` calls on the repository, `sst deploy|remove` against the production stage, recursive deletes of the repository, the home folder or a drive, and writing text that looks like a secret.

Edits to the agent's own limits (`.claude/settings.json`, `.claude/settings.local.json`, `.claude/guard.json`, `tools/claude-hooks/`) through Write/Edit or `cp`/`mv` return an `ask` decision, so Claude Code prompts the user even when the call would otherwise be allowed.

Secret patterns aim for few false positives. A card number must pass Luhn and must not be a public test card. A Discord webhook needs a snowflake ID and a full-length token. Binary files are skipped.

## CLI

```sh
dev-kit scan-secrets --staged | --all
dev-kit check-branch --staged | --pre-push [remote]
dev-kit check-quiet [step ...]
dev-kit worktrees-clean [--apply]
dev-kit sync-check
```

From a git hook, call the bin through Node (`node node_modules/dev-kit/bin/dev-kit.mjs ...`) when `pnpm` might not be on the path, for example in a Python repository.

## Templates and sync-check

`templates/` holds the starting point for a new repository:

- a `CLAUDE.md` skeleton, with the limits ("Never", then "Where to write") ahead of everything that encourages the agent;
- the agent roles in `templates/agents/` (architect, code-reviewer, implementer, ui-implementer, test-engineer, mechanic, researcher, qa-tester, perf-auditor, security-auditor, legal-reviewer, copy-reviewer);
- a `lessons.md` header.

Copy what the repository needs, then adapt the body of each agent to the repo's language, stack and checklist. The body may differ between repositories; the policy should not.

`dev-kit sync-check` runs in each consumer's CI and fails on:

- shims in `tools/claude-hooks/` that differ from `shim/` (line endings ignored);
- agents whose `model`, `effort`, `maxTurns` or `tools` differ from the template with the same name. A deliberate difference goes in `.claude/guard.json` as `"syncCheck": { "agentOverrides": { "<agent>": ["model"] } }`;
- agents listed in `"syncCheck": { "requiredAgents": [...] }` that are missing. Only agents that exist in both places, or are required, are checked; a repository may skip roles it does not need;
- a `CLAUDE.md` (root and `.claude/`, each one present) whose first two sections, outside code blocks, are not the limits and "Where to write". Spanish headings ("Prohibido", "Dónde se escribe") are accepted for repositories documented in Spanish.

When a lesson in one repository applies to all of them, fix it here (template, guard or pattern) and bump the tag in every consumer, instead of repeating it in each `lessons.md`.

## ESLint

```js
import devKit from "dev-kit/eslint";

export default [{ plugins: { local: devKit }, rules: { "local/no-comments": "error" } }];
```

`no-comments` allows tool directives only: `/// <reference>`, `@ts-expect-error` with a reason, and `eslint-disable` that names its rules. Rules under `local/`, `dev-kit/` and `no-restricted-*` can never be disabled inline.

## Design decisions

- **Git dependency, public repository.** No registry token in CI, and the code is open to read. GitHub Packages would need a classic personal access token.
- **One package, no build.** Plain `.mjs` with `.d.mts` types. Nothing to compile, nothing for pnpm to approve.
- **Shims at stable paths.** `settings.json` keeps pointing at `tools/claude-hooks/`, the guard fails closed when the kit is missing, and upgrading means bumping one tag.
- **Unified secret patterns.** The TypeScript repos contributed cloud and GitHub tokens, the Python repo contributed card-like numbers and Discord webhooks, and every repo now gets all of them.

## Develop

```sh
pnpm install
pnpm exec lefthook install
pnpm check
```
