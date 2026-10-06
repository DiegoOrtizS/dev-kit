export interface SecretRule {
  rule: string;
  pattern: RegExp;
  exempt?: (match: string) => boolean;
}

export interface SecretFinding {
  rule: string;
  line: number;
}

export const SECRET_RULES: SecretRule[];
export function findSecrets(text: string): SecretFinding[];
export function isAllowedOnBranch(paths: string[], rules: { allowedPaths: RegExp[] }): boolean;
