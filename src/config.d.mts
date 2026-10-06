export interface BranchRules {
  allowedPaths: RegExp[];
  allowMerges: boolean;
  blockAgentPush: boolean;
}

export interface LintRule {
  match: RegExp;
  command: string[];
}

export interface DevKitConfig {
  protectedBranches: Record<string, BranchRules>;
  blockedPaths: { read: RegExp[]; write: RegExp[]; commit: RegExp[] };
  secretScan: { skipFiles: Set<string> };
  lint: LintRule[];
  checks: [string, string][];
  worktrees: { base: string };
}

export const CONFIG_PATH: string;
export function normalizeConfig(raw?: unknown): DevKitConfig;
export function loadConfig(repoRoot: string): DevKitConfig;
