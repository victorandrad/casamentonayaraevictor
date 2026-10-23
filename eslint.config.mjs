// Lint do site do casamento (ESLint 10, flat config).
//
//   npm run lint            → tudo
//   npm run lint:backend    → só a API (apps/api, Node)
//   npm run lint:frontend   → shell e microfrontends (React) e packages/shared
//
// Só regras que pegam erro de verdade (recommended); formatação fica de fora.
import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  globalIgnores(['**/dist/**', '**/node_modules/**', 'design/**']),

  js.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    rules: {
      // TypeScript já confere nomes não declarados.
      'no-undef': 'off',
      // `const { id: _id, ...resto } = x` tira um campo de propósito.
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },

  // API, configs do Rsbuild e scripts rodam no Node.
  {
    files: ['apps/api/**/*.ts', '**/rsbuild.config.ts', 'packages/shared/*.ts', '*.mjs', '.github/scripts/*.mjs'],
    languageOptions: { globals: globals.node },
  },

  // Front-ends (React).
  {
    files: ['apps/{shell,evento,rsvp,presentes,mural,painel}/src/**/*.{ts,tsx}', 'packages/shared/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    // As regras clássicas dos hooks. As do React Compiler (set-state-in-effect, refs…) ficam de
    // fora: o projeto não usa o compilador e elas acusam padrões intencionais (estado de
    // carregamento num efeito, ref com o callback mais recente).
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
