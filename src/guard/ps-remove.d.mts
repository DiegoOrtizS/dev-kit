export const PS_REMOVERS: Set<string>;
export function powershellRemoveTargets(rawArgs: string[]): {
  recursive: boolean;
  targets: string[];
  unreadable: boolean;
};
