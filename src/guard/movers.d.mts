import type { Dialect } from "./dialects.mjs";

export function moverTargets(
  name: string,
  args: string[],
  dialect: Dialect,
  flags: { rename: boolean; link: boolean },
): { read: string[]; written: string[]; removed: string[] };
