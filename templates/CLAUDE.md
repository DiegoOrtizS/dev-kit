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

At most three small, current docs:

- `docs/progress.md`: state and next step.
- `docs/pending.md`: index of open items; detail and closed items live in `docs/pending-archive.md`.
- `docs/engineering/lessons.md`: mistakes already corrected; do not repeat them.

Read the relevant section only when the task touches it: `CONTEXT.md` (domain language; use its terms in code), `docs/engineering/standards.md`, the spec and plan under `docs/superpowers/`, `docs/adr/` (new ADR before reversing one).

## Context budget

<!-- dev-kit:context-budget -->

- Doc over ~3 KB: `grep -n` the heading, then read at most ~80 lines. Never `cat` a whole large doc.
- After a compaction, do not re-read specs or plans unless the next step needs a section.
- Never Read a scratchpad or saved tool-result file whole: grep it or read a bounded range.
- Wide exploration goes to a subagent with a short report.
- Tracker docs (`progress.md`, `pending.md`, follow-ups) stay a short index. Closed items and detail move to `<name>-archive.md`, which is never in "Read first". Budgets are in `.claude/guard.json` `syncCheck.docBudget`.

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
- `/clear` between tasks. Auto-compact window and parallel subagents come from `dev-kit/templates/claude/settings.json`; never add `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`.

## Advisor

Main session <model> with <advisor model> as advisor. Consult the advisor only:

- before accepting a plan, spec or architecture decision;
- when the same error shows up a second time;
- before closing a slice or opening a non-docs PR.

Never for small or mechanical changes. Subagents consult it only when blocked.

## Working style

- **Re-plan** after two failed attempts or a false assumption.
- **Lessons:** after a correction from <owner>, add one line to `docs/engineering/lessons.md`.
- **Red CI** on an own branch: fix it without asking, inside "Never".
- **Simplicity:** smallest change that fixes the root cause.

## Plans and subagents

- One PR per plan, with a whole-branch `code-reviewer` pass at the end.
- Each plan has a rulings doc, `docs/superpowers/plans/<date>-<plan>-rulings.md`, in the repo's docs language. One line per decision: `Ruling: <what> — <why> — <cost if wrong>`.
- The controller decides ambiguities itself and records a ruling. It asks <owner> only before a merge or a push.
- Subagents write their reports to files in the SDD workspace (`.superpowers/sdd/`, gitignored) and reply in under ~15 lines.
- Before deleting the SDD workspace, copy the deferred review minors into the rulings doc.

## Git

- Protected branches stay deployable. Short-lived branches, PR, green CI, squash-merge.
- Conventional Commits.
