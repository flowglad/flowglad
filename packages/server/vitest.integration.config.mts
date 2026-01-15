import { config } from 'dotenv'
import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

// Load .env.test if not in GitHub Actions
if (!process.env.GITHUB_ACTIONS) {
  config({ path: resolve(__dirname, '.env.test') })
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 60000, // 60 seconds
    hookTimeout: 60000, // 60 seconds
    setupFiles: ['./src/subrouteHandlers/__tests__/setup.ts'],
  },
})
