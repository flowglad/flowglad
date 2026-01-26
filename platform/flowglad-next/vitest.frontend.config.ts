import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Vitest configuration specifically for frontend/React tests (.test.tsx files).
 *
 * This configuration uses jsdom environment for proper DOM/React support,
 * while backend tests (.test.ts) run via bun test for better performance.
 */
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
      /**
       * Custom plugin to handle markdown file imports in tests.
       */
      {
        name: 'markdown-loader',
        load(id) {
          if (id.endsWith('.md')) {
            return `export default ${JSON.stringify(fs.readFileSync(id, 'utf-8'))}`
          }
        },
      },
    ],
    assetsInclude: ['**/*.md'],
    test: {
      // Only include .test.tsx files for frontend tests
      include: ['src/**/*.test.tsx'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.integration.test.*',
        '**/*.rls.test.*',
      ],
      // Use jsdom for React component tests
      environment: 'jsdom',
      setupFiles: ['./vitest.frontend.setup.ts'],
      env: loadEnv(mode, process.cwd(), ''),
      server: {
        deps: {
          inline: [/@stackframe\/stack-shared/, 'bignumber.js'],
        },
      },
      mockReset: true,
      clearMocks: true,
      silent: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@trigger': path.resolve(
          __dirname,
          './src/__mocks__/@trigger'
        ),
      },
    },
  }
})
