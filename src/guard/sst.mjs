import { ALLOW, deny } from "./verdict.mjs";

export function checkSst(words) {
  const sstIndex = words.slice(0, 4).indexOf("sst");
  if (sstIndex === -1) return ALLOW;
  const args = words.slice(sstIndex + 1);
  const destructive = args.some((argument) => argument === "remove" || argument === "deploy");
  const production = args.some(
    (argument, index) =>
      argument === "--stage=production" || (argument === "--stage" && args[index + 1] === "production"),
  );
  return destructive && production
    ? deny("Blocked: sst remove/deploy against the production stage needs the repo owner.")
    : ALLOW;
}
