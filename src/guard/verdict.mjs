export const ALLOW = { block: false };
export const deny = (reason) => ({ block: true, reason });
export const firstBlock = (verdicts) => verdicts.find((verdict) => verdict.block) ?? ALLOW;
