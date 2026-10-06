import { RuleTester } from "eslint";
import { afterAll, describe, it } from "vitest";
import { noComments } from "../src/eslint/no-comments.mjs";

Object.assign(RuleTester, { afterAll, describe, it });

const tester = new RuleTester({ languageOptions: { ecmaVersion: 2024, sourceType: "module" } });

const rejected = (code: string) => ({ code, errors: [{ messageId: "noComment" as const }] });
const afterStatement = (comment: string) => `const before = 1;\n${comment}\nconst after = 2;\n`;

tester.run("no-comments", noComments, {
  valid: [
    { code: "const total = 1;" },
    { code: "// eslint-disable-next-line no-console\nconsole.log(1);" },
    { code: "/* eslint-disable no-console */\nconsole.log(1);" },
    { code: "// @ts-expect-error legacy typing\nconst a = 1;" },
    { code: '/// <reference types="node" />\nconst a = 1;' },
    { code: "/* eslint-enable no-console */" },
    { code: "const a = 1; // eslint-disable-line no-console, no-alert" },
    { code: "// eslint-disable-next-line no-eval\nconst a = 1;" },
  ],
  invalid: [
    rejected("// explains the next line\nconst a = 1;"),
    rejected("/** jsdoc */\nexport const a = 1;"),
    rejected("const a = 1; /* trailing */"),
    rejected("// @ts-ignore\nconst a = 1;"),
    rejected("// @ts-expect-error\nconst a = 1;"),
    rejected("/* @ts-expect-error */\nconst a = 1;"),
    rejected("// @ts-nocheck\nconst a = 1;"),
    rejected(afterStatement("/* eslint-disable */")),
    rejected(afterStatement("// eslint-disable-line")),
    rejected(afterStatement("// eslint-disable-next-line")),
    rejected(afterStatement("/* eslint-enable */")),
    rejected(afterStatement("// eslint-disable-next-line no-console -- needed here")),
    rejected(afterStatement("/* eslint-disable no-console -- because */")),
    rejected(afterStatement("/* eslint-enable no-console -- because */")),
    rejected(afterStatement("// eslint-disable-next-line no-restricted-imports")),
    rejected(afterStatement("/* eslint-disable no-restricted-syntax */")),
    rejected(afterStatement("// eslint-disable-next-line no-restricted-properties")),
  ],
});
