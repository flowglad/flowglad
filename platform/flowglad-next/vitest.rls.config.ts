import fs from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Vitest configuration specifically for RLS (Row Level Security) tests.
 *
 * RLS tests MUST run with fileParallelism: false because:
 * 1. All RLS tests share the same database connection pool
 * 2. RLS tests set session-level PostgreSQL settings (request.jwt.claims, app.livemode, ROLE)
 * 3. When parallel tests interleave their transactions on pooled connections, the
 *    RLS context from one test can leak into another test's transaction
 * 4. This causes unpredictable failures like NotFoundError or serialization conflicts
 *
 * By running RLS test files sequentially (not in parallel with each other), we ensure
 * each test file gets exclusive access to the connection pool during its execution.
 */
export default defineConfig(({ mode }) => {
  return {
    plugins: [
      react(),
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
      include: [
        'src/**/*.rls.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      ],
      exclude: ['**/node_modules/**', '**/dist/**'],
      environment: 'jsdom',
      setupFiles: ['./vitest.setup.ts'],
      env: loadEnv(mode, process.cwd(), ''),
      server: {
        deps: {
          inline: [/@stackframe\/stack-shared/],
        },
      },
      mockReset: true,
      clearMocks: true,
      silent: false,
      // CRITICAL: Run RLS test files sequentially to prevent connection pool interference
      fileParallelism: false,
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
