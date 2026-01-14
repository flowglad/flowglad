import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
      /**
       * Custom plugin to handle markdown file imports in tests.
       *
       * Without this, Vite tries to parse .md files as JavaScript during test runs,
       * causing errors like "Failed to parse source for import analysis because
       * the content contains invalid JS syntax."
       *
       * This plugin intercepts markdown imports and transforms them to export
       * the file content as a string, matching how Next.js webpack config handles
       * them (via asset/source type). This allows code like:
       * `import prompt from '@/prompts/analyze-codebase.md'` to work in tests.
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
    /**
     * Tell Vite to treat .md files as assets.
     * This works together with the markdown-loader plugin above to ensure
     * markdown files are properly handled during test execution.
     */
    assetsInclude: ['**/*.md'],
    test: {
      include: [
        'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.integration.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
        // RLS tests must run separately with fileParallelism: false
        // to prevent database connection pool interference.
        // Use `bun run test:rls` or the combined `bun run test` command.
        '**/*.rls.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      ],
      /**
       * Default to 'node' environment for proper MSW support.
       *
       * MSW's setupServer from 'msw/node' uses Node.js-specific HTTP
       * interception that doesn't work correctly in jsdom environments.
       * Since most tests are backend/integration tests that need MSW,
       * we use 'node' as the default.
       *
       * For React component tests that need DOM APIs, add this comment
       * at the top of the test file:
       *   @vitest-environment jsdom
       */
      environment: 'node',
      setupFiles: ['./vitest.setup.ts'],
      env: loadEnv(mode, process.cwd(), ''),
      deps: {
        inline: [/@stackframe\/stack-shared/], // Force inline this package
      },
      server: {
        deps: {
          inline: [/@stackframe\/stack-shared/],
        },
      },
      mockReset: true,
      clearMocks: true,
      /**
       * Make sure tests running in CI show output
       */
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
