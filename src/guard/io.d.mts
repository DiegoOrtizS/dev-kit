export interface GuardIo {
  readTextFile(path: string): string | null;
  gitAlias(name: string, options: { cwd: string; gitArgs: string[] }): string | null;
}

export function toFileSystemPath(path: string, cwd: string): string;
export function readTextFile(path: string): string | null;
export function gitAlias(name: string, options: { cwd: string; gitArgs: string[] }): string | null;
export function guardIo(overrides?: Partial<GuardIo>): GuardIo;
