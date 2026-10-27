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
pnpm add -D --save-exact github:DiegoOrtizS/dev-kit#v0.4.0
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
      "matcher": "Bash|PowerShell|Monitor|Write|Edit|MultiEdit|NotebookEdit",
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

The guard always blocks these, whatever the config says: force pushes, `--all`/`--mirror` pushes, skipped or redirected hooks, `lefthook uninstall`, git aliases or includes set on the command line, git aliases already in the config that expand to a blocked command, shell aliases for a command the guard checks, `git reset --hard`, `git checkout`/`git restore` of the whole tree, `git clean -f`, reading `.env` files, `gh auth login|refresh|token`, `gh repo delete`, mutating `gh api` calls on the repository, `sst deploy|remove` against the production stage, recursive deletes of the repository, the home folder or a drive (also through globs, `find -delete` or a pipe) or of a path the guard cannot read, shells and `Invoke-Expression` fed a script the guard cannot read, and writing text that looks like a secret.

Edits to the agent's own limits (`.claude/settings.json`, `.claude/settings.local.json`, `.claude/guard.json`, `tools/claude-hooks/`) return an `ask` decision, so Claude Code prompts the user even when the call would otherwise be allowed. That covers Write/Edit, a `cp`/`mv`/`rsync`/`install` destination (and `<directory>/<source name>` when the destination is a directory, so `cp settings.json .claude/` counts), an `mv` or `Move-Item` source, `rm`, `unlink`, `shred`, `ln` (its link target too, since a link is a write handle on it), `git rm`, `git mv`, and the targets of a patch or checkout described below. Removing or moving a whole `.claude` or `tools` directory covers the files inside it. Inline interpreter code that names one of these paths next to a write call (`writeFileSync`, `open(…, 'w')`, `rename`, `copy`, `write_text`) returns `ask`, and so does a PowerShell `[IO.File]`/`[IO.Directory]` write method in a script that names one; their `Delete` and `Move` methods return `ask` whatever the path, like inline code that deletes files, and are blocked when an argument is a variable (`[IO.Directory]::Delete($HOME, $true)`), under the rule for commands built from variables.

A patch writes files without going through Write or Edit. `git apply`, `git am` and `patch` are checked against the files the patch names: the guard reads the patch from its file arguments, `-i`/`--input`, an input redirect (`< fix.diff`), a heredoc or here-string, a literal `echo`, or a `cat` of files piped in, takes the paths from its `diff --git`, `---`/`+++`, `rename`/`copy` and `Index:` lines, strips them with `-p` (git defaults to 1; `patch` without `-p` tries every strip level, since GNU patch's default depends on the patch) and prefixes `-d`/`--directory`, then gives each one the decision a Write to it would get. A patch whose targets cannot be read returns `ask`: one piped from another command (`git diff main | git apply -R`, `curl … | git apply`), a missing or non-regular file, a header that holds `$` or a backtick, or `git am --continue`/`--skip`, which apply patches already stored in `.git`. Dry runs (`--check`, `--stat`, `--numstat`, `--summary`) and `git am --abort` stay allowed. `git checkout <rev> -- <paths>`, `git checkout <rev> <paths>` and `git restore [--source] <paths>` get the same decision per pathspec, a `.claude` or `tools` pathspec covers the files inside, a glob pathspec is matched across directories as git does (`'*.json'` asks, `'*.ts'` does not), and `--staged` alone touches only the index. A pathspec that is the whole tree (`.` at the root, `:/`) is blocked like `git reset --hard`, because it discards uncommitted work in the shared tree.

Every tool that runs a script or writes text goes through the hook. `Bash`, `PowerShell` and `Monitor` commands are analyzed as scripts (`Monitor` streams a Bash script, so it gets the Bash dialect); the text written by `Write`, `Edit`, `MultiEdit` and `NotebookEdit` (`new_source`) is scanned for secrets. A tool missing from the `PreToolUse` matcher is never analyzed, which is why `sync-check` fails when a consumer's matcher lacks a tool the template lists.

A segment whose first word the guard does not know (`pnpm exec`, `npx`, `winpty`, `stdbuf`, `docker run`, any launcher) is re-checked from its first `git`, `gh`, `sst` (also `sst@version`), `lefthook`, `find`, `eval`, `iex`, delete command or shell, so `pnpm exec git push -f` reads as `git push -f`; names compare case-insensitively, since Windows runs `GIT.exe`. PowerShell's `Start-Process` / `saps` is read as the command it launches, with `-FilePath` and `-ArgumentList` (or positionals) joined back into one command line. Known commands are never re-anchored: `echo git push -f`, `grep git push src`, `man git push` and `git commit -m 'rm -rf cleanup'` stay allowed, and so does `pnpm exec dev-kit …` or `pnpm exec eslint …`, whose arguments contain no anchor.

A git alias is a second name for any command, so `git -c alias.p='push --force' p origin main` or `git config alias.x '!git push -f'` would run a forbidden push under a name the guard does not check. Setting any `alias.*`, `include.path` or `includeIf.*` entry through `-c`, `--config-env` or a `git config` write is blocked; reading one (`git config --get alias.x`, `git config alias.x`) is not.

An alias that already exists in the user's or the repository's config is resolved when it is used. git never consults aliases for its builtin subcommands, so for `status`, `push`, `commit` and the rest the guard does nothing extra; for any other subcommand it runs `git config --get alias.<name>` (with the call's `-C`, `--git-dir` and `--work-tree`, a five-second timeout) and follows alias chains. A plain alias is checked as the git command it expands to, so `git nuke` with `alias.nuke = reset --hard` is blocked like `git reset --hard`; a `!` alias is checked as the shell script git runs from the repository root, with the arguments appended, and returns `ask` when it refers to its arguments or variables (`"$1"`, `"$@"`), whose values the guard cannot see. When git cannot answer (it is missing, times out or reports a broken config) the call returns `ask`. An unknown subcommand with no alias (`git lfs`, any `git-<name>` on the PATH) is a program like any other and stays allowed. The builtin list is fixed in the code: a builtin missing from it only costs one `git config` process, and a name on it that some old git lacks would skip that git's alias, so the list holds only builtins older than git 2.30. Config keys that hold a command (`core.pager`, `core.editor`, `core.sshCommand`, `core.fsmonitor`, `sequence.editor`, `diff.external`, `diff.*.textconv`, `merge.*.driver`, `filter.*.clean|smudge|process`, `credential.helper` starting with `!`, `gpg.program`, `pager.*`) and the variables that do the same (`GIT_EDITOR`, `GIT_PAGER`, `PAGER`, `EDITOR`, `VISUAL`, `GIT_SEQUENCE_EDITOR`, `GIT_SSH_COMMAND`, `GIT_SSH`, `GIT_ASKPASS`, `GIT_EXTERNAL_DIFF`) have that command checked as a script when the call sets them through `-c`, a `git config` write or an assignment, so `git -c core.pager='rm -rf ~' log` is blocked and `git -c core.editor=true rebase --continue` is not; one read from `--config-env` or holding `$` is blocked as unreadable.

Shell aliases follow the same rule inside a command: `alias x='…'`, `Set-Alias`, `New-Alias` (`sal`, `nal`) are blocked when the alias runs a command the guard checks (`git`, `gh`, a delete, a shell, an interpreter), because later uses of the alias are not checked, and otherwise the alias text is checked as a script; functions defined in the command are already checked through their bodies. Aliases and functions that come from the user's shell profile are out of reach: seeing them would mean starting an interactive shell or sourcing the profile on every call, which runs the user's own code and costs far more than the hook should, and they are configuration the user wrote before the session, like an installed program. Writing to the profile itself is not guarded either.

Hooks can be disabled without touching `core.hooksPath`: by editing `.git/hooks/*` or `.git/config` (in a worktree the `.git` entry is a file that points outside the repository, so a repo-relative rule never sees it), by a `lefthook-local.yml` with `skip: true`, by `lefthook uninstall`, or by setting `LEFTHOOK=0` in a syntax the Bash rules did not read. Any path with a `.git/hooks`, `.git/config`, `.git/worktrees/*/config` or bare `.git` segment, the global `~/.gitconfig` or `~/.config/git/` (also as `%USERPROFILE%` or `C:/Users/<u>/`), or a file named `lefthook-local.yml`, returns `ask` whether it comes from Write/Edit, a `cp`/`mv` destination, a shell redirect (`> .git/hooks/pre-commit`), a writer such as `tee`, `chmod`, `rm`, `unlink`, `shred`, `truncate`, `Set-Content` or `Out-File`, an `mv` source, a link target of `ln`, an in-place editor (`sed -i`, `perl -pi`, `awk -i inplace`, `patch`), a patch target, `install` or `dd of=`; reading those files stays allowed. `lefthook uninstall` is blocked. The hook-disabling variables (`LEFTHOOK`, `LEFTHOOK_EXCLUDE`, `HUSKY`, `GIT_CONFIG_*`, and `HOME` / `XDG_CONFIG_HOME`, which point git at another global config) are also recognized in cmd's `set X=Y`, in PowerShell's `Set-Item`/`New-Item`/`Set-Content Env:X` and in `[Environment]::SetEnvironmentVariable(...)`, and feed the same rule as `LEFTHOOK=0 git commit`.

A recursive delete is judged by the directory it empties, not only by the path it names. A trailing pattern made only of `*`, `?`, `.` and bracket classes (`~/.*`, `**`, `./**`, `~/**/*`, `~/.[a-z]*`, `~/.[!.]*`, `[a-z]*`) stands for the whole directory above it, so `rm -rf ~/.*` is a delete of the home folder. Braces are expanded first (`~/{.,}*`, `~/.{ssh,aws}`). A pattern that keeps a literal part (`*.log`, `build-*`, `dist/**`, `~/.npm*`) cannot take its directory with it, so it is matched against the protected paths instead: the root, each drive, the repository, the home folder and their ancestors, the repository's `.git`, and `~/.ssh`, `~/.aws`, `~/.gnupg`, `~/.config` (the parent of `~/.config/gh`) and `~/.claude`. `~/.s*`, `~/.c*`, `<home parent>/*/.ssh` and `../<prefix of the repository>*` are denied for that reason. `~user` resolves to that user's home, and `$PWD`, `${PWD}`, `~+`, `$(pwd)` and `$(Get-Location)` to the working directory; a target that still holds a variable or a substitution after that (`rm -rf "$DIR"`, `rm -rf $(true) ~`, `Remove-Item -Recurse $env:X`, cmd's `%HOMEPATH%`) is denied, like a pipe the guard cannot read, with a message to name the path. An unquoted `$(…)` or backtick in an argument stays part of its word, as it does in double quotes, so the targets after it are still seen. `find … -delete` and `find … -exec rm …` delete the start paths (default `.`) unless a `-name`, `-path`, `-regex` or `-empty` predicate narrows the match to something smaller than everything: the predicate must come before the action, carry a literal character outside brackets (`*.log` yes, `*`, `./*`, `.*`, `[a-z]*` no), and the expression must be a plain AND chain, since `-o`, `!`, `-not` and parentheses can widen it again. When the targets arrive through a pipe (`echo ~ | xargs rm -rf`, `Get-ChildItem ~ | Remove-Item -Recurse`), the guard reads the producer when it is a literal path source (`echo`, `printf`, `ls`, `dir`, `find`, `Get-ChildItem`, `Get-Item`, with `-Filter`/`-Include` narrowing like `find -name`) and judges those paths; a producer it cannot read (`cat list.txt`, `curl`, `Get-Content`, anything with `$` or a backtick) is blocked, with a message to name the paths instead. In PowerShell `-Force` counts as recursive, because `Remove-Item -Force` on a non-empty directory may still remove it. Relative targets are resolved against the hook's working directory, so after a `cd`, `pushd`, `Set-Location` or `Push-Location` earlier in the same command line (`cd repos && rm -rf peruanito`) a recursive delete with a relative target returns `ask`; absolute, `~` and `$HOME` targets are judged as usual.

A shell can take its script from stdin instead of `-c`: `echo 'git push -f' | bash`, `bash <<< '…'`, `cat <<EOF | sh`, `pwsh -Command -`, `pwsh -File -`, `echo … | cmd`, and PowerShell's `iex` / `Invoke-Expression` (as a command or as a pipe consumer). When a shell without a script and without a positional argument receives a pipe, a here-string or a heredoc, the guard analyzes the text that reaches it if that text is a literal (an `echo`/`printf`/`Write-Output` line, a quoted PowerShell string, a `cat` heredoc) and blocks when it is not (`curl … | bash`, `cat script.sh | sh`, `echo "$CMD" | bash`, `Get-Content x | iex`, `iex $cmd`), since a script the guard cannot read is a script it cannot check. The same rule applies to any script text that is empty or still contains `$` or a backtick when the guard sees it: `bash -c "$CMD"`, `eval "$X"`, `bash <<< "$(cat x)"`, a heredoc body with `$CMD`, and a command word built from a variable or substitution (`$g push -f`, `$(echo git) push -f`, PowerShell `& $g push -f`). Variables elsewhere in a line are fine (`echo "$HOME"`, `cd "$(git rev-parse --show-toplevel)"`, `$x = Get-Date`, `$x -eq 1`): only the text that becomes a command must be literal. `bash script.sh` and `pwsh -File x.ps1` are unchanged: a file is not stdin. Inline code for another interpreter (`node -e`, `python -c`, `perl -e`, `ruby -e`, `php -r`) is a script the guard cannot parse, so it returns `ask` when the text spawns processes or deletes files (`child_process`, `execSync`, `spawn`, `system(`, `subprocess`, `os.remove`, `rmSync`, `unlink`, `rmdir`, `shutil`); `node -e "console.log(1)"` stays allowed. PowerShell flags are accepted as `-x`, `--x` or `/x` (`pwsh --command`, `pwsh /c`), and a bare argument (`powershell git push -f`, the Windows PowerShell 5.1 default) is read as the script unless it names a `.ps1` file.

Some writes stay out of the guard's sight, because judging them would mean running git or reading data it does not have. A command that moves the working tree to another commit (`git switch`, `git checkout <branch>`, `merge`, `pull`, `rebase`, `cherry-pick`, `revert`, `stash pop|apply`, plumbing such as `checkout-index` or `read-tree -u`) can bring in another version of `.claude/settings.json`; the guard does not diff commits. Archive extraction (`tar -x`, `unzip`, `Expand-Archive`) and an `rsync` of a directory's contents (`rsync -a x/ .claude/`) write files the guard does not list. Scripts run from files (`node x.js`, `bash x.sh`) and arguments built from variables or substitutions (`git push $FLAGS`) are not expanded. The user-level `~/.claude/settings.json`, which can turn every hook off, and the shell profiles are not protected paths.

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
- the scope is optional and lowercase, `[a-z0-9._/-]+`, so `deps-dev`, `guard/windows`, `check_message` and `v1.2` work and `Guard` does not. The underscore is for Python module names; none of the three repos has used one in a scope so far;
- the header is at most 100 characters, the subject is not empty and does not end with a period;
- the subject starts in lowercase, unless its first word is an all-caps name of two or more letters followed by a non-letter or the end (`CI runs twice`, `JSON output`, `CLAUDE.md budget`). This is what config-conventional's `subject-case` rejected (sentence, start, pascal and upper case), so `Add the thing`, `Plan 13 minors` and `OAuth login` fail. Across the three repos' `main` histories only five of 379 commits would have failed, two of them Dependabot titles;
- in the hook and in `--range`, a header in one of git's own forms is exempt: `Merge branch `, `Merge pull request #`, `Merge remote-tracking branch `, `Revert "`, `fixup! ` and `squash! `. Look-alikes such as `Merge the things` or `Revert deploy` are not, and `--message` exempts nothing, because a PR title becomes the squash subject on `main`.

Every problem in a header is reported at once, with the header itself, so the fix is one edit.

The three modes:

- `dev-kit check-commit <file>`: the `commit-msg` hook. Lines starting with `#` are dropped first, because git has not stripped its comment template yet when the hook runs.
- `dev-kit check-commit --message "<text>"`: one header, for example a pull request title. Only the first non-blank line is checked.
- `dev-kit check-commit --range <base>..<head>`: every commit in the range except merges. Nothing is skipped by author: an author name is whatever the committer typed, so the exemption for Dependabot lives in CI, keyed on the PR's author login.

The hook, in `lefthook.yml` (call the bin through Node where `pnpm` may not be on the path):

```yaml
commit-msg:
  commands:
    message:
      run: node node_modules/dev-kit/bin/dev-kit.mjs check-commit {1}
```

The CI job, on `pull_request` only, checks the PR's commits and its title. The SHAs and the title reach the script through `env`, never through `${{ }}` inside `run:`: a PR title is text anyone can write, and expanding it into the shell would run it. The whole job is skipped when the PR was opened by `dependabot[bot]`, decided from `github.event.pull_request.user.login` in the job's `if:` (an expression GitHub evaluates, never the shell), because Dependabot writes its own subjects and titles, some over 100 characters, and the check would only block its PRs. The range needs the full history, so the checkout uses `fetch-depth: 0`. The kit is a git dependency, so the repository's usual install step (`pnpm/action-setup` plus `pnpm install --frozen-lockfile`, or whatever the Python repo uses to install its Node dev tools) goes before the two `check-commit` steps.

```yaml
commits:
  if: github.event_name == 'pull_request' && github.event.pull_request.user.login != 'dependabot[bot]'
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
    - env:
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
- a `.claude/settings.json` whose `PreToolUse` entries running `tools/claude-hooks/guard.mjs` do not, together, match every tool in the template matcher (`Bash|PowerShell|Monitor|Write|Edit|MultiEdit|NotebookEdit`), or that has no such entry. A matcher is a regular expression over the tool name; `*` or an empty matcher covers everything. Settings that do not parse are reported once, by the previous check;
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

A release is a version bump merged into `main`. Open a PR that sets `version` in `package.json` and the pin in "Install"; once it merges and CI on `main` is green, `.github/workflows/release.yml` runs `dev-kit release-tag` against that commit, which reads the version and asks the remote whether `v<version>` exists. When it does not, the workflow creates an annotated tag at the commit CI tested, pushes it and creates a GitHub release with generated notes. When it does, the tag stays where it is (as `v0.1.0` to `v0.4.0`, created by hand, do), and the workflow only creates the release if that is missing too, so a rerun or a second push with the same version is idempotent. A tag is never moved.

The workflow is triggered by `workflow_run` on the CI workflow, not by the push itself, so a commit that fails CI is never tagged. It also checks that the CI run came from a `push`: CI runs for pull requests too, and a PR opened from a branch named `main` in a fork would otherwise look like a push to `main`. The runs are serialized by `concurrency: release` without cancellation; GitHub keeps one run queued per group, so when several commits land on `main` in quick succession a queued run can be superseded by the next one. The tag then lands on the next `main` commit that passes CI with that version, which is fine because the version, and so the tag, is the same.

Only that job has `contents: write`; the rest of CI stays read-only. The checkout does not persist its token, and the one step that needs to write pushes the tag over an explicit `x-access-token` URL with `GITHUB_TOKEN` and creates the release with the same token. Consumers still bump the pinned tag by hand, because Dependabot ignores git dependencies; the generated release notes list the merged PRs to read before bumping.

Add a repository ruleset on `refs/tags/v*` that blocks updating and deleting tags (Settings, Rules, Rulesets, new tag ruleset targeting `v*`, with "Restrict updates" and "Restrict deletions", no bypass actors). Leave creation allowed, so the workflow's `GITHUB_TOKEN` can push a new tag without a bypass. The workflow never moves a tag; the ruleset makes sure nobody else does either.

## Develop

```sh
pnpm install
pnpm exec lefthook install
pnpm check
```

CI runs `pnpm test:coverage` on Ubuntu and Windows with Node 22 and 24. `vitest.config.ts` fails the run below the coverage thresholds. Each threshold is the highest whole percent below the lowest value CI measured across those cells. The first run gave statements 75.17%, branches 77.62%, functions 76.69%, lines 75.15%; the commit-message and release-tag checks, tested in-process, moved the lowest cells (Ubuntu) to 80.4%, 82.35%, 81.85% and 80.55%, so the thresholds became 80, 82, 81 and 80. The guard bypass work then lifted every cell to 85.02%, 86.47%, 85.79% and 84.9%, and closing the gaps left by it to about 87.8%, 87.5%, 88.7% and 87.8%; each threshold rose by the whole percents it grew in that last step, to 82, 83, 83 and 82. Raise a threshold when coverage grows; never lower one to pass. Files that the tests reach only by spawning the CLI in a child process (`bin/`, `shim/`, `src/hooks/` and three of the `src/guardrails/` checks) read 0%, because the v8 provider does not instrument child processes.
