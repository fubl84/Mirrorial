// Lint setup for the remote UI. `npm run lint` existed in package.json but there was no config, so it could
// never run. The rule set is deliberately small: it is there to catch real mistakes (undefined names, broken
// hooks, duplicate keys), not to restyle 5000 lines of existing code.
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  settings: { react: { version: 'detect' } },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react/jsx-runtime', 'plugin:react-hooks/recommended'],
  plugins: ['react-refresh'],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs'],
  rules: {
    // The UI does not use PropTypes or TypeScript.
    'react/prop-types': 'off',
    // Text such as "don't" and quotes in JSX is fine.
    'react/no-unescaped-entities': 'off',
    // These two find real bugs and stay on as errors.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_' }],
  },
};
