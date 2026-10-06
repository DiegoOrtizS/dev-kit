import { describe, expect, it } from "vitest";
import { findSecrets, isAllowedOnBranch, passesLuhn } from "../src/guardrails/rules.mjs";

const sample = (...parts: string[]) => parts.join("");

describe("findSecrets", () => {
  it.each([
    ["github fine-grained PAT", sample("github", "_pat_", "11ABCDEFG0", "abcdefghijklmnopqrstuvwxyz0123456789")],
    ["github classic token", sample("gh", "p_", "a".repeat(36))],
    ["aws access key", sample("AK", "IA", "ABCDEFGHIJKLMNOP")],
    ["private key", sample("-----BEGIN ", "RSA PRIVATE KEY-----")],
    ["cloudflare api token", sample("CLOUDFLARE_API", "_TOKEN=", "abcdefghijklmnopqrstuvwxyz0123456789ABCD")],
    ["cloudflare api token in yaml", sample("CLOUDFLARE_API", "_TOKEN: ", "abcdefghijklmnopqrstuvwxyz0123456789ABCD")],
    [
      "cloudflare api token with spaces",
      sample("CLOUDFLARE_API", "_TOKEN = ", "abcdefghijklmnopqrstuvwxyz0123456789ABCD"),
    ],
    ["cloudflare user token", sample("cf", "ut_", "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH")],
    ["google client secret", sample("GOC", "SPX-", "abcdefghijklmnopqrstuvwxyz12")],
  ])("detects a %s", (_label, text) => {
    expect(findSecrets(`const value = "${text}";`)).toHaveLength(1);
  });

  it("ignores empty or templated cloudflare variables and ordinary code", () => {
    const empty = sample("CLOUDFLARE_API", "_TOKEN=");
    const templated = sample("CLOUDFLARE_API", "_TOKEN=", "$", "{{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(findSecrets(empty)).toEqual([]);
    expect(findSecrets(templated)).toEqual([]);
    expect(findSecrets("const a = 1;")).toEqual([]);
  });

  it("reports the 1-based line number", () => {
    expect(findSecrets(`a\nb\n${sample("AK", "IA", "ABCDEFGHIJKLMNOP")}`)[0]?.line).toBe(3);
  });
});

describe("isAllowedOnBranch", () => {
  const docsOnly = { allowedPaths: [/^docs\//, /\.md$/, /^\.claude\//, /^\.github\//] };

  it("allows paths that match the branch allowlist", () => {
    expect(
      isAllowedOnBranch(["docs/progress.md", "README.md", ".claude/agents/x.md", ".github/dependabot.yml"], docsOnly),
    ).toBe(true);
  });

  it("rejects any path outside the allowlist", () => {
    expect(isAllowedOnBranch(["docs/a.md", "src/lib/money.ts"], docsOnly)).toBe(false);
  });

  it("rejects everything when the allowlist is empty", () => {
    expect(isAllowedOnBranch(["docs/a.md"], { allowedPaths: [] })).toBe(false);
  });

  it("treats an empty list as nothing to reject", () => {
    expect(isAllowedOnBranch([], docsOnly)).toBe(true);
  });
});

function withCheckDigit(prefix: string) {
  const digit = [...Array(10).keys()].find((candidate) => passesLuhn(`${prefix}${candidate}`));
  return `${prefix}${digit}`;
}

const card = withCheckDigit(sample("4532015", "11283036"));
const grouped = (digits: string, separator: string) => digits.match(/.{4}/g)?.join(separator) ?? digits;
const webhook = (host: string) => sample("https://", host, "/api/webhooks/", "1".repeat(18), "/", "aB3_-".repeat(14));

describe("findSecrets from the Python bot", () => {
  it.each([
    ["discord webhook", webhook("discord.com")],
    ["legacy discord webhook", webhook("discordapp.com")],
    ["card number with spaces", grouped(card, " ")],
    ["card number with dashes", grouped(card, "-")],
    ["card number without separators", card],
    ["postgres url with a password", sample("postgres://user:", "hunter2@db.example.com/app")],
  ])("detects a %s", (_label, text) => {
    expect(findSecrets(`value = "${text}"`)).toHaveLength(1);
  });

  it.each([
    ["a repeated-digit placeholder", sample("0000000000", "000000")],
    ["a 13-digit timestamp", "1759700000000"],
    ["a decimal number", sample("1234567890", "123456.5")],
    ["an identifier with digits", `sku-${card}`],
    ["a local postgres url", sample("postgres://postgres:", "postgres@localhost:5432/test")],
    ["a public test card", sample("4111 1111 ", "1111 1111")],
    ["another public test card", sample("5500-0000-", "0000-0004")],
    ["a digit run that fails Luhn", sample("12345678", "90123456")],
    ["a fake webhook in a test", sample("https://discord", ".com/api/webhooks/", "1/general-token")],
  ])("ignores %s", (_label, text) => {
    expect(findSecrets(`value = "${text}"`)).toEqual([]);
  });

  it("checks every card-like run on a line", () => {
    expect(findSecrets(`a = "${sample("4111 1111 ", "1111 1111")}"; b = "${card}"`)).toHaveLength(1);
  });
});

describe("findSecrets refinements", () => {
  it.each(["ENCRYPTED PRIVATE KEY", "PGP PRIVATE KEY BLOCK", "PRIVATE KEY", "OPENSSH PRIVATE KEY"])(
    "detects a %s header",
    (kind) => {
      expect(findSecrets(["-----BEGIN ", kind, "-----"].join(""))).toHaveLength(1);
    },
  );
});
