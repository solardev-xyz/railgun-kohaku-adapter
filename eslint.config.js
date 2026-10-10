"use strict";
const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "**/node_modules/**",
      "coverage/**",
      "docs/**",
      "tools/freedom-legacy-qualification/**",
      "tools/railgun-runtime-build/scripts/fixtures/**",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-useless-escape": "off",
      "no-redeclare": ["error", { builtinGlobals: false }],
    },
  },
  { files: ["**/*.mjs"], languageOptions: { sourceType: "module" } },
  {
    files: ["**/*.test.js", "**/*.test.cjs"],
    languageOptions: { globals: globals.jest },
  },
];
