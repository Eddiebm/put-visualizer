import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// Minimal but real: this project has no build-time type checking, so
// no-undef is the cheapest possible guard against a missing import — it's
// what caught three real bugs (missing num/trimNum/autopilotChecks imports)
// the first time App.jsx was split into src/components/. Keep it on.
export default [
  {
    files: ["src/**/*.{js,jsx}", "api/**/*.js"],
    ignores: ["**/*.test.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { args: "none", varsIgnorePattern: "^_" }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // The rest of the "recommended" set (purity/immutability/set-state-in-effect
      // etc.) is tuned for the React Compiler and flags several pre-existing,
      // working patterns in this codebase (Date.now() in a memo, setState in an
      // effect for a data fetch) that predate this config and aren't regressions.
      // Worth revisiting as a deliberate refactor later — not mixed into a
      // mechanical file split.
    },
  },
];
