import js from '@eslint/js';
import globals from 'globals';

const projectGlobals = {
    MESSAGE_TYPES: 'readonly',
    ERROR_CODES: 'readonly',
    sendMessage: 'readonly',
    createError: 'readonly',
    isRestrictedUrl: 'readonly',
    classifyError: 'readonly',
    ERROR_DISPLAY: 'readonly',
    ERROR_CATEGORIES: 'readonly',
    ERROR_MESSAGES: 'readonly',
    getErrorMessage: 'readonly',
    STORAGE_KEYS: 'readonly',
    DEFAULT_SETTINGS: 'readonly',
    storageGet: 'readonly',
    storageSet: 'readonly',
    HISTORY_MAX: 'readonly',
    addToHistory: 'readonly',
    getHistory: 'readonly',
    createTurndownService: 'readonly',
    extractPageContent: 'readonly',
    convertActiveTab: 'readonly',
    generateFilename: 'readonly',
};

export default [
    { ignores: ['src/lib/**'] },
    js.configs.recommended,
    {
        rules: {
            'no-unused-vars': ['error', {
                caughtErrors: 'none',
                varsIgnorePattern: '^_',
                argsIgnorePattern: '^_'
            }]
        }
    },
    {
        files: ['src/background.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.serviceworker,
                ...globals.webextensions,
                ...projectGlobals,
                module: 'readonly',
            }
        }
    },
    {
        files: ['src/core/*.js', 'src/messaging/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                TurndownService: 'readonly',
                ...projectGlobals,
                module: 'readonly',
            }
        },
        rules: {
            'no-redeclare': ['error', { builtinGlobals: false }]
        }
    },
    {
        files: ['src/sidepanel/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                ...projectGlobals,
            }
        }
    },
    {
        files: ['src/popup/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                TurndownService: 'readonly',
            }
        }
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...projectGlobals,
                resetStore: 'readonly',
            }
        }
    },
];
