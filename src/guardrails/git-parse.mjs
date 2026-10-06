export function parsePrePush(stdin) {
  return stdin
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

export function parseNameList(output) {
  return output.split("\0").filter(Boolean);
}

export function addedLines(diff) {
  const added = [];
  let path = "";
  let line = 0;
  let inHeader = false;
  for (const row of diff.split(/\r?\n/)) {
    if (row.startsWith("diff --git ")) {
      inHeader = true;
      path = "";
    } else if (inHeader && row.startsWith("+++ ")) {
      const target = row.slice(4);
      path = target === "/dev/null" ? "" : target.replace(/^b\//, "");
    } else if (row.startsWith("@@")) {
      inHeader = false;
      line = Number(/\+(\d+)/.exec(row)?.[1] ?? 0) - 1;
    } else if (!inHeader && row.startsWith("+")) {
      line += 1;
      if (path) added.push({ path, line, text: row.slice(1) });
    }
  }
  return added;
}
