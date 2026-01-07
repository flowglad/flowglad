import path from 'node:path'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  return {
    test: {
      globals: true,
      environment: 'node', // Integration tests don't need jsdom
      include: ['src/**/*.integration.test.{js,ts,tsx}'],
      setupFiles: ['./vitest.integration.setup.ts'],
      testTimeout: 30000, // Longer timeout for API calls
      hookTimeout: 30000,
      pool: 'forks', // Isolate tests
      poolOptions: {
        forks: {
          singleFork: true, // Run serially to avoid rate limits
        },
      },
      env: loadEnv(mode, process.cwd(), ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
