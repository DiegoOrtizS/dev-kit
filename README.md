# dev-kit

Shared tooling for my personal repositories: a guard for Claude Code agents, git guardrails (secret scan, protected branches, commit messages, worktree cleanup) and an ESLint rule. It started as duplicated `tools/` folders in three repos, two in TypeScript and one in Python, that kept drifting apart.

The guard is how an agent holds itself back. It is **not a security boundary**: it stops honest mistakes and casual bypasses, not someone who sets out to defeat it.

## What is inside

| Piece                                                                                                | Entry                                            | Used by                                     |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| Claude Code `PreToolUse` guard                                                                       | `dev-kit/guard` (`runGuard`, `evaluateToolCall`) | any repo, any language                      |
| Claude Code `PostToolUse` lint                                                                       | `dev-kit/lint-after-edit` (`runLintAfterEdit`)   | any repo; the linter is configured per repo |
| Secret scan, branch policy, commit messages, quiet checks, worktree cleanup, sync check, release tag | `dev-kit` bin                                    | any repo with git and Node                  |
| `no-comments` ESLint rule                                                                            | `dev-kit/eslint`                                 | TypeScript repos (ESLint 9 or 10)           |
| Secret patterns                                                                                      | `dev-kit/secrets`                                | anything that wants the same list           |

The package exports runnable tools and configuration, not domain libraries. A Python repo uses it only as dev tooling and never imports it at runtime.

## Install

```sh
pnpm add -D --save-exact github:DiegoOrtizS/dev-kit#v0.3.0
```

Pin a tag. Dependabot does not update git dependencies, so a kit upgrade is a manual PR in each consumer that bumps the tag. In the PR that bumps past v0.4.0, switch the `commit-msg` hook and the PR title step in CI to `dev-kit check-commit` (see "Commit messages") and drop `@commitlint/*` with `commitlint.config.mjs`, or `.githooks/check_message.py` in the Python repo.

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

`templates/claude/settings.json` holds this hooks block plus the recommended `env` (`CLAUDE_CODE_AUTO_COMPACT_WINDOW` 400000, `CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS` 2). Copy it into a new repository's `.claude/settings.json`, or merge its keys into an existing one. Never add `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`: `sync-check` fails on it (see "Templates and sync-check").

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
  "worktrees": { "base": "origin/develop" },
  "syncCheck": {
    "requiredAgents": ["code-reviewer", "implementer"],
    "agentOverrides": { "security-auditor": ["tools"] },
    "docBudget": { "CLAUDE.md": 9216, "docs/progress.md": 4096, "docs/pending.md": 4096 }
  }
}
```

| Field                      | Default                                          | Meaning                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `protectedBranches`        | `main` only, nothing allowed, agent push blocked | `allowedPaths`: what may be committed or pushed directly. `allowMerges`: merge commits skip the path check (gitflow). `blockAgentPush`: the guard refuses `git push` to that branch. |
| `blockedPaths.read`        | none                                             | Paths the agent may not read (shell readers, `cp`/`mv` sources, the Read tool).                                                                                                      |
| `blockedPaths.write`       | none                                             | Paths the agent may not write (Write/Edit tools, `cp`/`mv` destinations).                                                                                                            |
| `blockedPaths.commit`      | none                                             | Paths that `scan-secrets` refuses to commit.                                                                                                                                         |
| `lint`                     | none                                             | First rule whose `match` fits the edited file runs. `{file}` is the file path; a leading `node` runs the current Node binary and is skipped when its script is missing.              |
| `checks`                   | format, lint, typecheck, test via pnpm           | Steps for `dev-kit check-quiet`.                                                                                                                                                     |
| `worktrees.base`           | `origin/main`                                    | Branch whose content `worktrees-clean` checks to decide what is merged.                                                                                                              |
| `syncCheck.requiredAgents` | none                                             | Agents that `sync-check` requires in `.claude/agents/`.                                                                                                                              |
| `syncCheck.agentOverrides` | none                                             | Per agent, the policy fields (`model`, `effort`, `maxTurns`, `tools`) that may differ from the template.                                                                             |
| `syncCheck.docBudget`      | none                                             | Repo-relative path (forward slashes) to its maximum size in bytes, a positive whole number. `sync-check` fails when the file is bigger, or missing.                                  |

The config can only tighten `main`: it is always protected and agent pushes to it are always blocked. A config with the wrong shape or an unknown key is an error, and the guard then blocks every call until it is fixed. A typo never turns protection off silently. On Windows, paths are compared case-insensitively and Git Bash (`/c/...`) and `~` forms are resolved.

The guard always blocks these, whatever the config says: force pushes, `--all`/`--mirror` pushes, skipped or redirected hooks, `git reset --hard`, `git clean -f`, reading `.env` files, `gh auth login|refresh|token`, `gh repo delete`, mutating `gh api` calls on the repository, `sst deploy|remove` against the production stage, recursive deletes of the repository, the home folder or a drive, and writing text that looks like a secret.

Edits to the agent's own limits (`.claude/settings.json`, `.claude/settings.local.json`, `.claude/guard.json`, `tools/claude-hooks/`) through Write/Edit or `cp`/`mv` return an `ask` decision, so Claude Code prompts the user even when the call would otherwise be allowed.

Secret patterns aim for few false positives. A card number must pass Luhn and must not be a public test card. A Discord webhook needs a snowflake ID and a full-length token, with or without an API version in the path. An AWS secret access key is caught only next to its variable name with a 40-character value, so templated `${{ secrets.* }}` references pass. Payment keys match `sk_live_` and `rk_live_` (Stripe and Culqi shapes), never `pk_live_` or test keys. npm, Anthropic and OpenAI project tokens match their published prefixes. Binary files are skipped.

CI runs gitleaks over the full history on every pull request and push to `main`, next to `scan-secrets --all`, because this repository is public.

## CLI

```sh
dev-kit scan-secrets --staged | --all
dev-kit check-branch --staged | --pre-push [remote]
dev-kit check-commit <file> | --message "<text>" | --range <base>..<head>
dev-kit check-quiet [step ...]
dev-kit worktrees-clean [--apply]
dev-kit sync-check
dev-kit release-tag
```

From a git hook, call the bin through Node (`node node_modules/dev-kit/bin/dev-kit.mjs ...`) when `pnpm` might not be on the path, for example in a Python repository.

`worktrees-clean` prints what it would remove, and `--apply` removes it. It never touches the current worktree, a worktree with uncommitted or untracked files, or a protected branch. A worktree or local branch counts as merged when its commit is already in `worktrees.base`, or when merging it into the base would leave the base tree unchanged (`git merge-tree --write-tree`), which is how squash merges are recognized. A branch whose changes conflict with the base, or were edited again on the base after the squash, is kept; delete it by hand. `--write-tree` needs git 2.38 or later. With older git the check fails, so only commits already in the base count as merged.

## Commit messages

`dev-kit check-commit` applies one Conventional Commits rule set in every repository, in the hook and in CI. It replaces commitlint plus `config-conventional` in the TypeScript repos and `.githooks/check_message.py` in the Python one, which had drifted apart (72 versus 100 characters, PR title only versus every commit). The rules:

- the header is `<type>(<scope>)?!?: <subject>`, with type one of `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `build`, `perf`, `style`, `revert`;
- the scope is optional and lowercase, `[a-z0-9./-]+`, so `deps-dev`, `guard/windows` and `v1.2` work and `Guard` does not;
- the header is at most 100 characters, the subject is not empty and does not end with a period;
- the subject starts in lowercase, unless its first word is an all-caps name of two or more letters followed by a non-letter or the end (`CI runs twice`, `JSON output`, `CLAUDE.md budget`). This is what config-conventional's `subject-case` rejected (sentence, start, pascal and upper case), so `Add the thing`, `Plan 13 minors` and `OAuth login` fail. Across the three repos' `main` histories only five of 379 commits would have failed, two of them Dependabot titles;
- in the hook and in `--range`, a header in one of git's own forms is exempt: `Merge branch `, `Merge pull request #`, `Merge remote-tracking branch `, `Revert "`, `fixup! ` and `squash! `. Look-alikes such as `Merge the things` or `Revert deploy` are not, and `--message` exempts nothing, because a PR title becomes the squash subject on `main`.

Every problem in a header is reported at once, with the header itself, so the fix is one edit.

The three modes:

- `dev-kit check-commit <file>`: the `commit-msg` hook. Lines starting with `#` are dropped first, because git has not stripped its comment template yet when the hook runs.
- `dev-kit check-commit --message "<text>"`: one header, for example a pull request title. Only the first non-blank line is checked.
- `dev-kit check-commit --range <base>..<head>`: every commit in the range except merges. Commits whose author name or email contains `dependabot` are skipped, because Dependabot writes its own subjects and the check would only block its PRs.

The hook, in `lefthook.yml` (call the bin through Node where `pnpm` may not be on the path):

```yaml
commit-msg:
  commands:
    message:
      run: node node_modules/dev-kit/bin/dev-kit.mjs check-commit {1}
```

The CI job, on `pull_request` only, checks the PR's commits and its title. The SHAs and the title reach the script through `env`, never through `${{ }}` inside `run:`: a PR title is text anyone can write, and expanding it into the shell would run it. The title step is skipped for `dependabot[bot]`, whose titles can exceed 100 characters; its commits are already skipped by author. The range needs the full history, so the checkout uses `fetch-depth: 0`. The kit is a git dependency, so the repository's usual install step (`pnpm/action-setup` plus `pnpm install --frozen-lockfile`, or whatever the Python repo uses to install its Node dev tools) goes before the two `check-commit` steps.

```yaml
commits:
  if: github.event_name == 'pull_request'
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@<sha> # v7
      with:
        fetch-depth: 0
    - uses: actions/setup-node@<sha> # v7
      with:
        node-version: 22
    - env:
        BASE: ${{ github.event.pull_request.base.sha }}
        HEAD: ${{ github.event.pull_request.head.sha }}
      run: node node_modules/dev-kit/bin/dev-kit.mjs check-commit --range "$BASE..$HEAD"
    - if: github.actor != 'dependabot[bot]'
      env:
        TITLE: ${{ github.event.pull_request.title }}
      run: node node_modules/dev-kit/bin/dev-kit.mjs check-commit --message "$TITLE"
```

This repository squash-merges with the PR title as the commit subject, so the title check is what keeps the history on `main` conventional; the range check keeps the branch history readable in review.

## Templates and sync-check

`templates/` holds the starting point for a new repository:

- a `CLAUDE.md` skeleton, with the limits ("Never", then "Where to write") ahead of everything that encourages the agent, then "Read first" (three small docs at most), "Context budget", the advisor rule and the conventions for plans run by subagents (rulings doc, reports in files, one PR per plan);
- `claude/settings.json`, the recommended `env` and hooks for `.claude/settings.json`;
- the agent roles in `templates/agents/` (architect, code-reviewer, implementer, ui-implementer, test-engineer, mechanic, researcher, qa-tester, perf-auditor, security-auditor, legal-reviewer, copy-reviewer);
- a `lessons.md` with the lessons that already apply to every repository.

Copy what the repository needs, then adapt the body of each agent to the repo's language, stack and checklist. The body may differ between repositories; the policy should not.

`dev-kit sync-check` runs in each consumer's CI and fails on:

- shims in `tools/claude-hooks/` that differ from `shim/` (line endings ignored);
- agents whose `model`, `effort`, `maxTurns` or `tools` differ from the template with the same name. A deliberate difference goes in `.claude/guard.json` as `"syncCheck": { "agentOverrides": { "<agent>": ["model"] } }`;
- agents listed in `"syncCheck": { "requiredAgents": [...] }` that are missing. Only agents that exist in both places, or are required, are checked; a repository may skip roles it does not need;
- a `CLAUDE.md` (root and `.claude/`, each one present) whose first two sections, outside code blocks, are not the limits and "Where to write". Spanish headings ("Prohibido", "Dónde se escribe") are accepted for repositories documented in Spanish;
- no context budget section: at least one `CLAUDE.md` (root or `.claude/`) must carry `<!-- dev-kit:context-budget -->` on its own line right under a `## ` heading, outside code blocks. The heading is free text, so "Context budget" and "Presupuesto de contexto" both pass. One file is enough because Claude Code loads both. There is no opt-out;
- a `.claude/settings.json` that sets `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (any value), sets `env.CLAUDE_CODE_AUTO_COMPACT_WINDOW` below 300000 or to something that is not a whole number, or is not valid JSON. A missing file or an unset window passes. `.claude/settings.local.json` is personal and gitignored, so it is never checked;
- a file listed in `syncCheck.docBudget` that is bigger than its budget, or missing. Size is UTF-8 bytes after dropping a BOM and turning CRLF into LF, so Windows and Linux agree. A missing file fails instead of being skipped, so a renamed tracker cannot escape its budget silently: move the entry with the file.

Add the marker like this (the bullets come from `templates/CLAUDE.md`; translate them for a Spanish repository):

```md
## Context budget

<!-- dev-kit:context-budget -->

- Doc over ~3 KB: `grep -n` the heading, then read at most ~80 lines. Never `cat` a whole large doc.
```

Suggested budgets: `CLAUDE.md` (or `.claude/CLAUDE.md`) 9216 bytes; tracker indexes such as `docs/progress.md`, `docs/pending.md` and `docs/follow-ups.md` 4096 bytes. Archives (`*-archive.md`) get no budget, because they are never in "Read first".

Why these rules exist: a committed `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50` with a 200000 window spread from one repository to another by copy. Compaction then fired at about 91K tokens while a fresh session already starts near 70K, so sessions compacted every ~9 turns: over 1,600 compactions and about 31 hours in two repositories, and some 110M cache-write tokens. After each compaction the agent re-read tracker docs of 38 to 62 KB (one spec 71 times), and reading docs whole with `cat` or `sed` was about 30% of tool-result tokens. The fixes were a larger window without the percent override, trackers split into a small index plus an archive, and the context budget bullets. The checks keep those fixes from drifting back.

When a lesson in one repository applies to all of them, fix it here (template, guard or pattern) and bump the tag in every consumer, instead of repeating it in each `lessons.md`.

## Upgrade from v0.2.0

Each consumer, in one PR (steps 2 and 4 change agent limits, so the owner approves them):

1. Bump the pin: `pnpm add -D --save-exact github:DiegoOrtizS/dev-kit#v0.3.0`.
2. `.claude/settings.json`: delete `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` and set `env.CLAUDE_CODE_AUTO_COMPACT_WINDOW` to `"400000"` (300000 at least). Compare with `templates/claude/settings.json`.
3. `CLAUDE.md`: add the context budget section with `<!-- dev-kit:context-budget -->` under its heading, or add the marker under the section the repository already has.
4. `.claude/guard.json`: add `syncCheck.docBudget` with the suggested budgets. Split any tracker that is over budget into an index plus an `-archive.md` first, and trim `CLAUDE.md` if it is over 9216 bytes (the marker and its blank line add 33 bytes).
5. Run `pnpm exec dev-kit sync-check` (or `node node_modules/dev-kit/bin/dev-kit.mjs sync-check`) before pushing.

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
- **Context rules are checks, not advice.** The compaction trap spread by copying a settings file, and tracker docs regrew after each cleanup. A failing CI step stops both; a paragraph in `CLAUDE.md` did not. The marker keeps the CLAUDE.md check language-neutral.
- **Merged means the content is in the base.** `worktrees-clean` used to match the tip's commit subject against recent base subjects, and repeated subjects such as Dependabot's `chore(deps): bump ...` got unmerged branches force-deleted. A branch is now removed only when git shows that nothing it changes is missing from the base.
- **Unified secret patterns.** The TypeScript repos contributed cloud and GitHub tokens, the Python repo contributed card-like numbers and Discord webhooks, and every repo now gets all of them.
- **One commit-message rule set, as a command.** Three copies of the rule (commitlint config, a Python hook and a PR-title action) disagreed on the header limit and on what CI checked. The checker is a `dev-kit` subcommand so the hook and CI run the same code, and it is tested against a real git repository.
- **Tags come from the version, not from a hand.** The release workflow decides from `package.json` and the remote's tags, through a unit-tested function, and never touches an existing tag.

## Releases

A release is a version bump merged into `main`. Open a PR that sets `version` in `package.json` and the pin in "Install"; once it merges, `.github/workflows/release.yml` runs `dev-kit release-tag`, which reads the version and asks the remote whether `v<version>` exists. When it does not, the workflow creates an annotated tag at the merge commit, pushes it and creates a GitHub release with generated notes. When it does, the run is a no-op: a tag is never moved, so a tag created by hand (as `v0.1.0` to `v0.4.0` were) stays where it is, and a second push with the same version does nothing. The runs are serialized by `concurrency: release`, so two merges cannot race for the same tag.

Only that job has `contents: write`; the rest of CI stays read-only. Consumers still bump the pinned tag by hand, because Dependabot ignores git dependencies; the generated release notes list the merged PRs to read before bumping.

Add a repository ruleset on `refs/tags/v*` that blocks updating and deleting tags (Settings, Rules, Rulesets, new tag ruleset targeting `v*`, with "Restrict updates" and "Restrict deletions", no bypass actors). Leave creation allowed, so the workflow's `GITHUB_TOKEN` can push a new tag without a bypass. The workflow never moves a tag; the ruleset makes sure nobody else does either.

## Develop

```sh
pnpm install
pnpm exec lefthook install
pnpm check
```

CI runs `pnpm test:coverage` on Ubuntu and Windows with Node 22 and 24. `vitest.config.ts` fails the run below the coverage thresholds. Each threshold started as the highest whole percent below the lowest value the first CI run measured across those cells: statements 75.17%, branches 77.62%, functions 76.69%, lines 75.15%. The commit-message and release-tag checks, tested in-process, raised local coverage to about 80.5%, 82.4%, 82.2% and 80.6%, and the thresholds moved up two points each, leaving a margin for the cells that measure lower. Raise a threshold when coverage grows; never lower one to pass. Files that the tests reach only by spawning the CLI in a child process (`bin/`, `shim/`, `src/hooks/` and three of the `src/guardrails/` checks) read 0%, because the v8 provider does not instrument child processes.
