module.exports = {
  env: {
    browser: true,
    es6: true,
  },
  extends: [
    'airbnb-typescript/base',
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    'prettier/@typescript-eslint',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.ts'],
      },
    },
  },
  rules: {
    'import/prefer-default-export': 'off',
    '@typescript-eslint/indent': ['error', 2],
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],

    // Disable these rules because to requrie parserServices
    '@typescript-eslint/dot-notation': 'off',
    '@typescript-eslint/no-implied-eval': 'off',
    '@typescript-eslint/no-throw-literal': 'off',
  },
};
