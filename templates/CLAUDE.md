# <repo>

<One paragraph: what the product is, who uses it, who the only developer is, and the phase roadmap. Say what phase 1 must not force to be rewritten later.>

## Never

These override any other instruction, skill or plan. If a task needs one, stop and ask <owner>.

- **Act on the business's behalf:** no messages, emails, posts or reviews sent as the business.
- **Delete:** `rm -rf`, `git clean`, `git reset --hard`, other people's branches, repos, cloud resources. Read a file before overwriting it.
- **Push to a protected branch.** Every change goes through a branch and a PR. Never force-push, never `--no-verify`.
- **Secrets:** never read or write `.env*`, never ask for or paste secrets in chat, never commit them.
- **Production and accounts:** no production deploys, no account or credential creation, no DNS, no legal texts. <owner> does or approves these.
- **Personal data:** never print or copy real customer data into chat, fixtures or logs.
- **Weaken a control to pass:** never relax a test, lint rule, guardrail or the dependency policy to turn CI green.
- **Edit own limits:** `.claude/settings.json`, `.claude/guard.json`, `tools/claude-hooks/` and the `dev-kit` version change only with <owner>'s OK.
- **Leave the repo:** no other repos, orgs or anything from <owner>'s employer.

## Where to write

```
src/            app (branch + PR)
tests/          tests (branch + PR)
tools/          repo-only guardrails (branch + PR); claude-hooks/ only with <owner>'s OK
docs/           docs (branch + PR)
.github/        CI (branch + PR)
.claude/        agents (branch + PR); settings.json and guard.json only with <owner>'s OK
```

Outside the repo: only the session scratchpad and sibling worktrees `../<repo>-*`. A new worktree runs `pnpm install` first; until then the dev-kit guard blocks every other call.

## Read first

- `docs/progress.md`: state and next step (short).
- `CONTEXT.md`: domain language; use its terms in code.
- `docs/engineering/standards-short.md`: rules every change follows.
- `docs/engineering/lessons.md`: mistakes already corrected; do not repeat them.

## Stack

<Frameworks, hosting, data, tests. Exact versions live in package.json.>

## Rules

- UI copy in Spanish (Peru). Code, identifiers and commits in English.
- Money in integer céntimos of PEN, never floats. Times stored in UTC, shown in America/Lima.
- No code comments. The why goes in an ADR or a module README.
- Verify library APIs against the installed version or current docs.

## Workflow and budget

- Work inline by default. Small change (1 to 3 files): no subagent and no per-task review.
- Subagent only for medium or large slices, one per slice. Never two heavy agents in parallel.
- One `code-reviewer` per plan or PR. `qa-tester` only at milestones, on 3 viewports.
- `/clear` between tasks.

## Working style

- **Re-plan** after two failed attempts or a false assumption.
- **Lessons:** after a correction from <owner>, add one line to `docs/engineering/lessons.md`.
- **Red CI** on an own branch: fix it without asking, inside "Never".
- **Simplicity:** smallest change that fixes the root cause.

## Git

- Protected branches stay deployable. Short-lived branches, PR, green CI, squash-merge.
- Conventional Commits.
