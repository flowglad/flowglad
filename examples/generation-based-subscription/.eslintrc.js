module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier', 'import', 'unused-imports'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'next/core-web-vitals',
    'prettier'
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  settings: {
    'import/resolver': {
      typescript: true
    }
  },
  rules: {
    // Prettier integration
    'prettier/prettier': 'error',

    // STRICT TYPESCRIPT RULES - No any usage / unsafe any flows
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'error',
    '@typescript-eslint/no-unsafe-call': 'error',
    '@typescript-eslint/no-unsafe-member-access': 'error',
    '@typescript-eslint/no-unsafe-return': 'error',
    '@typescript-eslint/no-unsafe-argument': 'error',

    // No type assertions (as/<>). Prefer proper narrowing.
    '@typescript-eslint/consistent-type-assertions': [
      'error',
      {
        assertionStyle: 'never'
      }
    ],
    '@typescript-eslint/no-non-null-assertion': 'error',

    // Additional strict rules
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/require-await': 'error',
    '@typescript-eslint/no-unchecked-indexed-access': 'error',
    '@typescript-eslint/no-unnecessary-condition': 'error',

    // Prevent common mistakes
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }
    ],
    '@typescript-eslint/no-empty-function': 'error',
    '@typescript-eslint/no-empty-interface': 'error',
    '@typescript-eslint/no-invalid-void-type': 'error',
    '@typescript-eslint/prefer-as-const': 'error',
    '@typescript-eslint/prefer-function-type': 'error',
    '@typescript-eslint/prefer-readonly': 'error',
    '@typescript-eslint/prefer-string-starts-ends-with': 'error',
    '@typescript-eslint/prefer-includes': 'error',

    // Code quality and boundaries
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'error',
    '@typescript-eslint/no-var-requires': 'error',
    '@typescript-eslint/prefer-namespace-keyword': 'error',

    // Consistency rules
    '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'separate-type-imports', disallowTypeAnnotations: false }
    ],
    '@typescript-eslint/ban-ts-comment': [
      'error',
      {
        'ts-ignore': 'ban',
        'ts-nocheck': 'ban',
        'ts-check': 'ban',
        'ts-expect-error': 'allow-with-description',
        minimumDescriptionLength: 3
      }
    ],
    '@typescript-eslint/ban-types': [
      'error',
      {
        extendDefaults: true,
        types: {
          '{}': {
            message: 'Use a more specific type or Record<string, unknown>',
            fixWith: 'Record<string, unknown>'
          }
        }
      }
    ],

    // Import hygiene
    'import/order': [
      'error',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          ['parent', 'sibling', 'index']
        ],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true }
      }
    ],
    'import/newline-after-import': 'error',

    // Remove unused imports cleanly
    'unused-imports/no-unused-imports': 'error',

    // General ESLint rules
    'no-console': ['error', { allow: ['warn', 'error'] }],
    eqeqeq: 'error',
    'no-throw-literal': 'error',
    'no-debugger': 'error',
    'no-alert': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'no-unused-expressions': 'error'
  },
  overrides: [
    {
      files: ['*.test.ts', '*.test.tsx', '*.spec.ts', '*.spec.tsx'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-console': 'off'
      }
    }
  ]
};
