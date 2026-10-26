export interface Dialect {
  escape: string;
  quotes: string;
  breaks: Set<string>;
  whitespace: Set<string>;
  escapesInDoubleQuotes: (char: string) => boolean;
  substitutionInQuotes: boolean;
  bashSyntax: boolean;
  comments?: boolean;
}

export const BASH: Dialect;
export const POWERSHELL: Dialect;
export const CMD: Dialect;
export function commandName(word: string): string;
export function dialectOfShell(name: string): Dialect | null;
export function scriptFromShell(name: string, args: string[]): { script: string; dialect: Dialect } | null;
export function shellReadsStdin(name: string, args: string[]): boolean;
