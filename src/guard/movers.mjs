import { basename, posix } from "node:path";
import { POWERSHELL } from "./dialects.mjs";

const TARGET_DIR_ATTACHED = /^--target-directory=(.*)$/;
const PS_DEST = /^-dest/i;
const PS_PATH = /^-(?:path|literalpath|lp)$/i;
const PS_VALUED =
  /^-(?:filter|include|exclude|depth|force|recurse|container|passthru|whatif|confirm|erroraction|verbose)$/i;

function forward(path) {
  return path.replace(/^</, "").replace(/\\/g, "/");
}

function intoDirectory(directory, sources) {
  return sources.map((source) => posix.join(forward(directory), basename(forward(source))));
}

function pack(sources, written, removed, { rename, link }) {
  return {
    read: sources,
    written: link ? [...sources, ...written] : written,
    removed: [...removed, ...(rename ? sources : [])],
  };
}

function bashMover(name, args, flags) {
  const positionals = [];
  let directory = null;
  for (let index = 0; index < args.length; index += 1) {
    const attached = TARGET_DIR_ATTACHED.exec(args[index]);
    if (attached) directory = attached[1];
    else if (args[index] === "-t" || args[index] === "--target-directory") directory = args[(index += 1)] ?? null;
    else if (!args[index].startsWith("-")) positionals.push(args[index]);
  }
  if (directory !== null) {
    const written = intoDirectory(directory, positionals);
    return pack(positionals, written, written, flags);
  }
  const sources = positionals.slice(0, -1);
  const destination = positionals.at(-1);
  const replaced = destination === undefined ? [] : intoDirectory(destination, sources);
  return pack(sources, destination === undefined ? [] : [destination], replaced, flags);
}

function powershellMover(args, flags) {
  let destination = null;
  const paths = [];
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const colon = /^(-[A-Za-z]+):(.*)$/.exec(args[index]);
    const flag = colon ? colon[1] : args[index];
    if (PS_DEST.test(flag)) destination = colon ? colon[2] : args[(index += 1)];
    else if (PS_PATH.test(flag)) paths.push(colon ? colon[2] : args[(index += 1)]);
    else if (PS_VALUED.test(flag)) {
      if (!colon) index += 1;
    } else if (!args[index].startsWith("-")) positionals.push(args[index]);
  }
  if (destination === null) destination = positionals.pop() ?? null;
  const sources = paths.length > 0 ? paths : positionals;
  const replaced = destination === null ? [] : intoDirectory(destination, sources);
  return pack(sources, destination === null ? [] : [destination], replaced, flags);
}

export function moverTargets(name, args, dialect, flags) {
  return dialect === POWERSHELL ? powershellMover(args, flags) : bashMover(name, args, flags);
}
