import type { GuardContext, Verdict } from "./guard.mjs";
import type { Pipe } from "./segments.mjs";

export function checkPipes(pipes: Pipe[], context: GuardContext): Verdict;
