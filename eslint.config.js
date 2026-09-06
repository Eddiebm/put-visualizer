import babelParser from "@babel/eslint-parser";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// tsc --noEmit (see `npm run typecheck`) is now the build-time type-safety
// net — it catches missing imports, wrong shapes, and undefined identifiers
// far more precisely than no-undef ever did. ESLint's job here has narrowed
// to what tsc doesn't check: the react-hooks rules (rules-of-hooks,
// exhaustive-deps). Those are purely syntactic, so TS/TSX source is parsed
// with @babel/eslint-parser (which strips types before ESLint sees the AST)
// rather than typescript-eslint — as of this writing, typescript-eslint
// doesn't support the TypeScript version this project pins (see
// package.json), so it can't be used here at all.
export default [
  {
    files: ["src/**/*.{ts,tsx}", "api/**/*.ts"],
    languageOptions: {
      parser: babelParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ["@babel/preset-typescript", "@babel/preset-react"],
        },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // no-undef / no-unused-vars are deliberately left off here: tsc
      // already catches both, with full type information, and doing it
      // again on Babel's stripped-of-types AST produces false positives on
      // TS-only constructs (type-only imports, interface members, etc.)
      //
      // The rest of the react-hooks "recommended" set (purity/immutability/
      // set-state-in-effect etc.) is tuned for the React Compiler and flags
      // several pre-existing, working patterns in this codebase (Date.now()
      // in a memo, setState in an effect for a data fetch) that predate
      // this config and aren't regressions. Worth revisiting as a
      // deliberate refactor later — not mixed into a mechanical migration.
    },
  },
];
