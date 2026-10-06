export interface PrePushUpdate {
  localRef: string;
  localSha: string;
  remoteRef: string;
  remoteSha: string;
}

export interface AddedLine {
  path: string;
  line: number;
  text: string;
}

export function parsePrePush(stdin: string): PrePushUpdate[];
export function parseNameList(output: string): string[];
export function addedLines(diff: string): AddedLine[];
