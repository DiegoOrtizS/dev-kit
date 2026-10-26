import type { Dialect } from "./dialects.mjs";

export function setterAssignments(name: string, args: string[], dialect: Dialect | undefined): string[] | null;
export function environmentCalls(script: string, dialect: Dialect): string[];
