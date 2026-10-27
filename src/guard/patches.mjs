import { posix } from "node:path";
import { checkWrittenPaths } from "./env-files.mjs";
import { toFileSystemPath } from "./io.mjs";
import { parseArguments } from "./options.mjs";
import { ALLOW, ask } from "./verdict.mjs";

const UNREADABLE_PATCH = ask(
  "This applies a patch whose target files the guard cannot read (fed by a pipe, a missing file, a variable, or a resumed git am). The repo owner must confirm it.",
);
const GIT_PATCH_VALUED = new Set([
  "-p",
  "-C",
  "--directory",
  "--exclude",
  "--include",
  "--whitespace",
  "--build-fake-ancestor",
  "--patch-format",
  "--resolvemsg",
  "--quoted-cr",
  "--empty",
]);
const PATCH_VALUED = new Set(
  "-B -D -d -F -g -i -o -p -r -V -Y -z --prefix --ifdef --directory --fuzz --get --input --output --strip --reject-file --version-control --basename-prefix --suffix --quoting-style --reject-format --read-only".split(
    " ",
  ),
);
const DRY_RUN = new Set(["--check", "--stat", "--numstat", "--summary"]);
const AM_RESUME = new Set(["--continue", "-r", "--resolved", "--skip", "--retry", "--allow-empty"]);
const AM_STOP = new Set(["--abort", "--quit", "--show-current-patch"]);
const HEADER = /^(?:(?:\+\+\+|---|\*\*\*) (.+?)(?:\t.*)?|(?:rename|copy) (?:from|to) (.+)|Index: (.+))$/;
const RANGE = /^(?:\*\*\*|---) \d+(?:,\d+)? (?:\*\*\*\*|----)\s*$/;
const QUOTED_OR_WORD = /"(?:[^"\\]|\\.)*"|\S+/g;
const DYNAMIC = /[$`]/;
const ABSOLUTE = /^([\\/]|[A-Za-z]:)/;
const ESCAPES = { t: "\t", n: "\n" };

function unquote(path) {
  if (!/^".*"$/.test(path)) return path;
  return path
    .slice(1, -1)
    .replace(/\\([0-7]{3}|.)/g, (_, escaped) =>
      /^[0-7]{3}$/.test(escaped) ? String.fromCharCode(parseInt(escaped, 8)) : (ESCAPES[escaped] ?? escaped),
    );
}

function headerPaths(text) {
  const paths = [];
  for (const line of text.split(/\r?\n|\\n/)) {
    if (line.startsWith("diff --git ")) {
      paths.push(...(line.slice("diff --git ".length).match(QUOTED_OR_WORD) ?? []).map(unquote));
    } else if (!RANGE.test(line)) {
      const match = HEADER.exec(line);
      if (match !== null) paths.push(unquote((match[1] ?? match[2] ?? match[3]).trim()));
    }
  }
  if (paths.some((path) => DYNAMIC.test(path)) || (paths.length === 0 && DYNAMIC.test(text))) return null;
  return paths;
}

function strippedPaths(path, level) {
  if (path === "/dev/null" || path === "") return [];
  const parts = path.replace(/\\/g, "/").split(/\/+/);
  if (level === null) return parts.map((_, index) => parts.slice(index).join("/")).filter(Boolean);
  return level < parts.length ? [parts.slice(level).join("/")] : [];
}

function targetPaths(paths, { level, directory, roots }) {
  return paths
    .flatMap((path) => strippedPaths(path, level))
    .map((path) => (directory ? posix.join(directory, path) : path))
    .flatMap((path) => (ABSOLUTE.test(path) ? [path] : roots.map((root) => (root ? posix.join(root, path) : path))));
}

function readPatch(file, context) {
  return DYNAMIC.test(file) ? null : context.io.readTextFile(toFileSystemPath(file, context.cwd));
}

function stdinTexts(input, context) {
  if (input === undefined) return [""];
  if ("text" in input) return [input.text];
  if ("files" in input) return input.files.map((file) => readPatch(file, context));
  return [null];
}

function patchTexts(files, input, context) {
  const named = files.filter((file) => file !== "-").map((file) => readPatch(file, context));
  return files.length === 0 || files.includes("-") ? [...named, ...stdinTexts(input, context)] : named;
}

function withoutRedirect(positionals, input) {
  const index = input?.redirected === undefined ? -1 : positionals.indexOf(input.redirected);
  return index === -1 ? positionals : positionals.filter((_, position) => position !== index);
}

function stripLevel(value, fallback) {
  if (value === undefined) return fallback;
  const level = Number(value);
  return Number.isInteger(level) && level >= 0 ? level : null;
}

function checkTargets(texts, options, context) {
  const paths = [];
  for (const text of texts) {
    const found = text === null ? null : headerPaths(text);
    if (found === null) return UNREADABLE_PATCH;
    paths.push(...found);
  }
  return checkWrittenPaths(targetPaths(paths, options), context);
}

export function checkGitPatch(subcommand, rest, context, input) {
  const { values, flags, positionals } = parseArguments(rest, GIT_PATCH_VALUED);
  if (subcommand === "am" && flags.some((flag) => AM_STOP.has(flag))) return ALLOW;
  if (subcommand === "am" && flags.some((flag) => AM_RESUME.has(flag))) return UNREADABLE_PATCH;
  if (subcommand === "apply" && flags.some((flag) => DRY_RUN.has(flag)) && !flags.includes("--apply")) return ALLOW;
  const texts = patchTexts(withoutRedirect(positionals, input), input, context);
  const options = {
    level: stripLevel(values["-p"], 1),
    directory: values["--directory"],
    roots: [null, context.repoRoot],
  };
  return checkTargets(texts, options, context);
}

export function checkPatchCommand(args, context, input) {
  const { values, positionals } = parseArguments(args, PATCH_VALUED);
  if (withoutRedirect(positionals, input).length > 0) return ALLOW;
  const file = values["-i"] ?? values["--input"];
  const texts = file === undefined ? stdinTexts(input, context) : [readPatch(file, context)];
  const options = {
    level: stripLevel(values["-p"] ?? values["--strip"], null),
    directory: values["-d"] ?? values["--directory"],
    roots: [null],
  };
  return checkTargets(texts, options, context);
}
