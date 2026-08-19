'use strict';

// Flat config for a zero-dependency CommonJS CLI. The package itself ships no
// deps (see package.json) — everything here is dev-only tooling, so it never
// reaches the published tarball.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    // Generated / vendored bytes: the committed Yarn release binary and the
    // installed tree are not ours to lint.
    ignores: ['.yarn/**', 'node_modules/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      // A CLI's whole output surface is stdout; console is the product here,
      // not a stray debug line.
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
