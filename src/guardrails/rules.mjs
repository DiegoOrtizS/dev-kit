const REPEATED_DIGITS = /^(\d)\1{12,}$/;
const CARD_LIKE = /(?<![\w.-])(?:\d[ -]?){15,18}\d(?![\w.-])/g;

export const PUBLIC_TEST_CARDS = new Set([
  "4111111111111111",
  "4012888888881881",
  "4242424242424242",
  "4000056655665556",
  "4000000000000002",
  "4000000000000077",
  "5555555555554444",
  "5105105105105100",
  "5500000000000004",
  "2221000000000009",
  "2223003122003222",
  "6011111111111117",
  "6011000990139424",
  "3530111333300000",
  "3566002020360505",
]);

export function passesLuhn(digits) {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function isRealCardNumber(match) {
  const digits = match.replace(/[ -]/g, "");
  return !REPEATED_DIGITS.test(digits) && !PUBLIC_TEST_CARDS.has(digits) && passesLuhn(digits);
}

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
  { rule: "discord-webhook", pattern: /discord(?:app)?\.com\/api\/webhooks\/\d{17,20}\/[\w-]{60,}/ },
  {
    rule: "card-number",
    matches: (content) => [...content.matchAll(CARD_LIKE)].some(([match]) => isRealCardNumber(match)),
  },
];

function hits(content, { pattern, matches }) {
  return matches ? matches(content) : pattern.test(content);
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
