export const ALLOW = { block: false };
export const deny = (reason) => ({ block: true, reason });
export const ask = (reason) => ({ block: false, ask: true, reason });
export const firstBlock = (verdicts) =>
  verdicts.find((verdict) => verdict.block) ?? verdicts.find((verdict) => verdict.ask) ?? ALLOW;
