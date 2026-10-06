import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import devKit from "./src/eslint/index.mjs";

const config = [
  { ignores: ["node_modules/**", "coverage/**"] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.{ts,mts,js,mjs,cjs}"],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
  },
  {
    plugins: { "dev-kit": devKit },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "dev-kit/no-comments": "error",
      "max-lines": ["error", { max: 200, skipBlankLines: true }],
    },
  },
  { files: ["test/**"], rules: { "max-lines": ["error", { max: 300, skipBlankLines: true }] } },
  { ...tseslint.configs.disableTypeChecked, files: ["**/*.{js,mjs,cjs}"] },
  eslintConfigPrettier,
];

export default config;
