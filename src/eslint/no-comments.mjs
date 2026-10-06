const referenceDirective = /^\s*\/\s*<reference\s/;
const tsExpectError = /^\s*@ts-expect-error\s+\S/;
const eslintDirective = /^\s*eslint-(?:disable|enable)(?:-next-line|-line)?(?:\s+([\s\S]*))?$/;
const protectedRule = /(?:^|\/)no-restricted-|^local\/|^dev-kit\//;

function isNamedRuleList(list) {
  if (list === undefined || list.includes("--")) return false;
  const rules = list
    .split(",")
    .map((rule) => rule.trim())
    .filter((rule) => rule !== "");
  return rules.length > 0 && rules.every((rule) => !protectedRule.test(rule));
}

function isAllowedDirective(text) {
  if (referenceDirective.test(text) || tsExpectError.test(text)) return true;
  const match = eslintDirective.exec(text);
  return match !== null && isNamedRuleList(match[1]);
}

function locationOutsideDirective(sourceCode, comment) {
  const { line } = comment.loc.start;
  if (line === 1 || !eslintDirective.test(comment.value)) return comment.loc;
  const previousLine = sourceCode.lines[line - 2];
  return { line: line - 1, column: previousLine.length };
}

export const noComments = {
  meta: {
    type: "suggestion",
    docs: { description: "Disallow code comments; rationale belongs in Markdown docs" },
    messages: {
      noComment: "Code comments are not allowed. Make the code self-explanatory and move rationale to docs.",
    },
    schema: [],
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.type !== "Shebang" && !isAllowedDirective(comment.value)) {
            context.report({ loc: locationOutsideDirective(context.sourceCode, comment), messageId: "noComment" });
          }
        }
      },
    };
  },
};
