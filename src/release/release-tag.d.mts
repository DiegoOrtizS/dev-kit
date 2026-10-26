import type { DevKitConfig } from "../config.mjs";

export interface ReleasePlan {
  tag: string;
  create: boolean;
}

export function releasePlan(packageJsonText: string, lsRemoteOutput: string): ReleasePlan;
export function releaseTag(config: DevKitConfig, args: string[], repoRoot?: string): ReleasePlan;
