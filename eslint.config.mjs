// Copyright (c) the Espanso.VSCode.Ext project contributors.

// Flat ESLint config using the typescript-eslint helper:
// https://typescript-eslint.io/getting-started

import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        { selector: "import", format: ["camelCase", "PascalCase"] },
      ],
      curly: "warn",
      eqeqeq: "warn",
      "no-throw-literal": "warn",
    },
  },
  {
    ignores: ["dist/", "dist-test/", "out/", "node_modules/"],
  }
);
