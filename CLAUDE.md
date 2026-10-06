# dev-kit

Shared agent guard, git guardrails and ESLint rule for Diego's personal repositories (peruanito, tcg-store, bot). Public repo. Consumers install it as a pinned git dependency and call it through shims. See `README.md`.

## Never

These override any other instruction, skill or plan. If a task needs one, stop and ask Diego.

- **Weaken the guard to pass:** never relax a block, a test or a secret pattern to make CI or a consumer green. A new false positive gets a narrow exemption and a test.
- **Push to `main`, force-push, `--no-verify`.** Every change goes through a branch, a PR and green CI.
- **Tags:** creating or moving a `v*` tag publishes a version to every consumer. Only after the PR is merged, and never move an existing tag.
- **Secrets:** never read or write `.env*`, never paste secrets, never put real tokens in tests (build them from parts, as the tests already do).
- **Private material:** nothing from Diego's employer and nothing from the consumer repos' business data. This repo is public.
- **Edit own limits:** `.claude/settings.json` and `.claude/guard.json` change only with Diego's OK.
- **Lifecycle scripts:** no `prepare`, `postinstall` or build step. pnpm would block the git dependency in every consumer.

## Rules

- Code, docs, commits and messages in English. Conventional Commits.
- No code comments. The why goes in `README.md`.
- Behavior that differs between consumers belongs in `.claude/guard.json`, never in a fork or a branch.
- Every exported module has a `.d.mts` next to it.
- `pnpm check` before every commit. Windows and Linux both run in CI.
- After a release, each consumer needs a manual PR that bumps the tag. Dependabot does not update git dependencies.
