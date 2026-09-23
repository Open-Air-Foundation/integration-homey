'use strict';

/**
 * @module eslint.config
 * Flat config for ESLint 9.
 *
 * `eslint-config-athom` still ships eslintrc-style objects, so it is bridged
 * through FlatCompat. Its `eslint-plugin-node` dependency is unmaintained and
 * calls `context.getScope()`, removed in ESLint 9, so that plugin is stripped
 * out here rather than crashing every run.
 */

const path = require('node:path');
const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * Drops the `node` plugin and its rules from a FlatCompat config.
 * That plugin calls `context.getScope()`, which ESLint 9 removed, and would crash every run.
 *
 * @param config - Flat config object produced by FlatCompat
 */
function withoutNodePlugin(config) {
  const next = { ...config };

  if (next.plugins?.node) {
    next.plugins = { ...next.plugins };
    delete next.plugins.node;
  }

  if (next.rules) {
    next.rules = Object.fromEntries(
      Object.entries(next.rules).filter(([rule]) => !rule.startsWith('node/')),
    );
  }

  return next;
}

module.exports = [
  {
    ignores: [
      '.cursor/',
      '.homeybuild/',
      'node_modules/',
      '_STUFF/',
      'app.json',
      'widgets/**/public/lottie.min.js',
    ],
  },
  ...compat.extends('athom/homey-app').map(withoutNodePlugin),
  {
    languageOptions: {
      parserOptions: {
        project: path.join(__dirname, 'tsconfig.json'),
        tsconfigRootDir: __dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: { project: path.join(__dirname, 'tsconfig.json') },
        node: { extensions: ['.js', '.ts'] },
      },
      // The SDK types are installed under an alias, so subpaths do not resolve.
      'import/core-modules': ['homey', 'homey/lib/Homey', 'homey/lib/PairSession'],
    },
    rules: {
      'import/extensions': ['error', 'ignorePackages', { js: 'never', ts: 'never' }],
      // Homey's typings are only reachable through import-equals syntax.
      '@typescript-eslint/no-require-imports': ['error', { allowAsImport: true }],
      'no-use-before-define': ['error', { functions: false }],
    },
  },
  {
    // Driver folders are thin shims that re-export the shared implementation.
    files: ['drivers/**/device.ts', 'drivers/**/driver.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['eslint.config.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'import/no-extraneous-dependencies': 'off',
    },
  },
];
