import { isLongOption } from "./options.mjs";
import { ALLOW, deny } from "./verdict.mjs";

const GH_OPTIONS_WITH_VALUE = new Set(["-R", "--repo", "--hostname"]);
const GH_API_OPTIONS_WITH_VALUE = new Set([
  "-H",
  "--header",
  "-q",
  "--jq",
  "-t",
  "--template",
  "--hostname",
  "--cache",
  "-p",
  "--preview",
]);
const GH_API_BODY_OPTIONS = new Set(["-f", "-F", "--field", "--raw-field", "--input"]);
const GH_API_SENSITIVE_ENDPOINTS = [
  /^repos\/[^/]+\/[^/]+\/?$/,
  /^repos\/[^/]+\/[^/]+\/git\/refs(\/|$)/,
  /^repos\/[^/]+\/[^/]+\/branches\/.+\/protection(\/|$)/,
];

function normalizeGhEndpoint(endpoint) {
  return endpoint
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/^\/+/, "")
    .split("?")[0];
}

function checkGhApi(args) {
  let method = null;
  let hasBody = false;
  let endpoint = null;
  for (let i = 0; i < args.length; i += 1) {
    const argument = args[i];
    if (argument === "-X" || argument === "--method") {
      method = args[i + 1] ?? "";
      i += 1;
    } else if (argument.startsWith("--method=")) {
      method = argument.slice("--method=".length);
    } else if (/^-X./.test(argument)) {
      method = argument.slice(2).replace(/^=/, "");
    } else if (GH_API_BODY_OPTIONS.has(argument)) {
      hasBody = true;
      i += 1;
    } else if (/^-[fF]./.test(argument) || /^--(field|raw-field|input)=/.test(argument)) {
      hasBody = true;
    } else if (GH_API_OPTIONS_WITH_VALUE.has(argument)) {
      i += 1;
    } else if (!argument.startsWith("-") && endpoint === null) {
      endpoint = argument;
    }
  }
  const effectiveMethod = (method ?? (hasBody ? "POST" : "GET")).toUpperCase();
  if (effectiveMethod === "GET" || endpoint === null) return ALLOW;
  const path = normalizeGhEndpoint(endpoint);
  return GH_API_SENSITIVE_ENDPOINTS.some((pattern) => pattern.test(path))
    ? deny("Blocked: changing the repository, its refs or branch protection through gh api is not allowed.")
    : ALLOW;
}

export function checkGh(args) {
  const positionalIndexes = [];
  for (let i = 0; i < args.length; i += 1) {
    if (GH_OPTIONS_WITH_VALUE.has(args[i])) i += 1;
    else if (!args[i].startsWith("-")) positionalIndexes.push(i);
  }
  const [areaIndex, actionIndex] = positionalIndexes;
  const area = args[areaIndex];
  const action = args[actionIndex];
  if (area === "auth") {
    if (action === "login" || action === "refresh" || action === "token") {
      return deny("Blocked: gh auth login/refresh/token is not allowed. This machine uses a narrowly scoped token.");
    }
    const showsToken = args.some((argument) => argument === "-t" || isLongOption(argument, "show-token", 2));
    if (action === "status" && showsToken) return deny("Blocked: printing the gh token is not allowed.");
  }
  if (area === "repo" && action === "delete") return deny("Blocked: gh repo delete is not allowed.");
  if (area === "api") return checkGhApi(args.slice(areaIndex + 1));
  return ALLOW;
}
