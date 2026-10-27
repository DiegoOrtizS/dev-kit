import type { GuardContext, Verdict } from "./guard.mjs";
import type { SegmentInput } from "./stdin.mjs";

export function checkGitPatch(
  subcommand: string,
  rest: string[],
  context: GuardContext,
  input: SegmentInput | undefined,
): Verdict;
export function checkPatchCommand(args: string[], context: GuardContext, input: SegmentInput | undefined): Verdict;
