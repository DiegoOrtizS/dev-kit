import type { Dialect } from "./dialects.mjs";

export interface PipeSource {
  words: string[];
  raw: string;
}

export interface Pipe {
  from: PipeSource;
  to: string[];
}

export interface Heredoc {
  owner: string[];
  body: string;
}

export interface InputRedirect {
  owner: string[];
  path: string;
}

export interface Found {
  segments: string[][];
  heredocs: Heredoc[];
  written: string[];
  pipes: Pipe[];
  inputs: InputRedirect[];
  topLevel: number;
}

export function splitSegments(command: string, dialect?: Dialect): Found;
