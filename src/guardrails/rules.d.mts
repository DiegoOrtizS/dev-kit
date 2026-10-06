export interface SecretRule {
  rule: string;
  pattern?: RegExp;
  matches?: (content: string) => boolean;
}

export interface SecretFinding {
  rule: string;
  line: number;
}

export const PUBLIC_TEST_CARDS: Set<string>;
export const SECRET_RULES: SecretRule[];
export function passesLuhn(digits: string): boolean;
export function findSecrets(text: string): SecretFinding[];
export function isAllowedOnBranch(paths: string[], rules: { allowedPaths: RegExp[] }): boolean;
