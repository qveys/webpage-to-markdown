import js from '@eslint/js';
import globals from 'globals';

export default [
    {
        ignores: ['src/lib/**']
    },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                chrome: 'readonly',
                TurndownService: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['error', {
                caughtErrors: 'none',
                varsIgnorePattern: '^_',
                argsIgnorePattern: '^_'
            }]
        }
    }
];
