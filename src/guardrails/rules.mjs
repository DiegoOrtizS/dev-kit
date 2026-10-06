const REPEATED_DIGITS = /^(\d)\1{12,}$/;

export const SECRET_RULES = [
  { rule: "github-fine-grained-pat", pattern: /github_pat_[A-Za-z0-9_]{30,}/ },
  { rule: "github-token", pattern: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { rule: "aws-access-key", pattern: /(AKIA|ASIA)[0-9A-Z]{16}/ },
  { rule: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY( BLOCK)?-----/ },
  {
    rule: "postgres-url-with-password",
    pattern: /postgres(ql)?:\/\/[^:\s/@]*:(?!\$\{)[^@\s]+@(?!(localhost|127\.0\.0\.1|\[::1\])([:/?#\s"'\x60]|$))/,
  },
  { rule: "cloudflare-api-token-variable", pattern: /CLOUDFLARE_API_TOKEN\s*[=:]\s*["']?(?!$)[A-Za-z0-9_-]{20,}/ },
  { rule: "cloudflare-token", pattern: /cf[ua]t_[A-Za-z0-9]{40,}/ },
  { rule: "google-client-secret", pattern: /GOCSPX-[A-Za-z0-9_-]{20,}/ },
  { rule: "discord-webhook", pattern: /discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+/ },
  {
    rule: "card-like-number",
    pattern: /(?<![\w.-])(?:\d[ -]?){15,18}\d(?![\w.-])/,
    exempt: (match) => REPEATED_DIGITS.test(match.replace(/[ -]/g, "")),
  },
];

function hits(content, { pattern, exempt }) {
  const match = pattern.exec(content);
  return match !== null && !(exempt && exempt(match[0]));
}

export function findSecrets(text) {
  return text
    .split(/\r?\n/)
    .flatMap((content, index) =>
      SECRET_RULES.filter((rule) => hits(content, rule)).map(({ rule }) => ({ rule, line: index + 1 })),
    );
}

export function isAllowedOnBranch(paths, rules) {
  return paths.every((path) => rules.allowedPaths.some((allowed) => allowed.test(path)));
}
