# Lessons

One line per correction from the owner, newest first, as `- YYYY-MM-DD: what happened. Rule: the rule that prevents it.` When a lesson becomes a permanent rule, move it to `CLAUDE.md` or the standards and delete it here. A lesson that applies to every repo goes to dev-kit (templates or guard) instead.

- 2026-10-23: an async sync awaited a fetch and then replaced the whole state, dropping a write that arrived during the await; a cancel raced a slow schedule the same way. Rule: never await and then replace shared state. Snapshot before the await and merge only the delta, tag each run with a generation counter and drop stale results, or serialize the calls on one chained promise.
- 2026-10-23: tracker docs grew to 40-60 KB and were re-read after every compaction. Rule: a tracker is a short index (under ~3 KB) plus an `-archive.md` that is never in "Read first"; `syncCheck.docBudget` in `.claude/guard.json` keeps it there.
- 2026-10-23: a committed `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` with a 200000 window, copied between repos, compacted sessions every ~9 turns (over 1,600 compactions in two repos). Rule: no percent override and a compact window of at least 300000 in `.claude/settings.json`; dev-kit sync-check fails otherwise.
