import path from 'node:path'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  return {
    test: {
      globals: true,
      environment: 'node', // Integration tests don't need jsdom
      include: [
        'integration-tests/**/*.integration.test.{js,ts,tsx}',
      ],
      setupFiles: ['./vitest.integration.setup.ts'],
      testTimeout: 30000, // Longer timeout for API calls
      hookTimeout: 30000,
      // Run tests serially to avoid Stripe rate limits
      // Using fileParallelism instead of forks pool to avoid Zod v4 registry collisions
      fileParallelism: false,
      env: loadEnv(mode, process.cwd(), ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
