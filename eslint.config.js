import js from '@eslint/js';

const commonRules = {
    ...js.configs.recommended.rules,
    complexity: ['error', 10],
    curly: ['error', 'all'],
    'max-depth': ['error', 3],
    'max-lines': ['error', {max: 300, skipBlankLines: true, skipComments: true}],
    'max-lines-per-function': ['error', {max: 80, skipBlankLines: true, skipComments: true}],
    'max-params': ['error', 4],
    'no-duplicate-imports': 'error',
    'no-else-return': 'error',
    'no-magic-numbers': ['error', {ignore: [-1, 0, 1, 2, 100]}],
    'no-unused-vars': ['error', {
        argsIgnorePattern: '^_$',
        caughtErrors: 'all',
        caughtErrorsIgnorePattern: '^_$',
        varsIgnorePattern: '^_$',
    }],
    'object-shorthand': 'error',
    'prefer-const': 'error',
};

const nodeGlobals = {
    Buffer: 'readonly',
    console: 'readonly',
    process: 'readonly',
};

const gjsGlobals = {
    ARGV: 'readonly',
    console: 'readonly',
    global: 'readonly',
    log: 'readonly',
};

export default [
    {
        ignores: [
            'node_modules/**',
            'extension/stylesheet.css',
            'design/direction-lab/stylesheet.css',
            // Removed slice-by-slice as the first-party modules are decomposed.
            'design/direction-lab/{catalog-state,extension}.js',
            'extension/*.js',
            'extension/shared/{primitives,token-geometry}.js',
            'scripts/**',
            'tests/unit/**',
            'tests/journeys/**',
            'tests/lint/invalid.js',
        ],
    },
    {
        files: ['eslint.config.js'],
        ...js.configs.recommended,
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: nodeGlobals,
        },
        linterOptions: {
            noInlineConfig: true,
            reportUnusedDisableDirectives: 'error',
        },
    },
    {
        files: ['tests/lint/valid.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: nodeGlobals,
        },
        linterOptions: {
            noInlineConfig: true,
            reportUnusedDisableDirectives: 'error',
        },
        rules: commonRules,
    },
    {
        files: ['extension/shared/history-range-stepper.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: gjsGlobals,
        },
        linterOptions: {
            noInlineConfig: true,
            reportUnusedDisableDirectives: 'error',
        },
        rules: commonRules,
    },
    {
        files: ['tests/journeys/**/*.js', 'tests/gjs/**/*.js'],
        languageOptions: {globals: gjsGlobals},
        rules: {
            'max-lines': ['error', {max: 400, skipBlankLines: true, skipComments: true}],
            'max-lines-per-function': ['error', {max: 120, skipBlankLines: true, skipComments: true}],
        },
    },
];
