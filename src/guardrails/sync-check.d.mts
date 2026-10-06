import type { DevKitConfig } from "../config.mjs";

export const POLICY_FIELDS: string[];
export function parseFrontmatter(text: string): Record<string, string>;
export function checkShims(repoRoot: string): string[];
export function checkAgents(repoRoot: string, syncCheck?: Partial<DevKitConfig["syncCheck"]>): string[];
export function checkClaudeMd(repoRoot: string): string[];
export function syncProblems(repoRoot: string, config: DevKitConfig): string[];
export function syncCheck(config: DevKitConfig, args: string[], repoRoot?: string): void;
