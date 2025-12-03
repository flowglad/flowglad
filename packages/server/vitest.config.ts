import { defineConfig } from 'vitest/config'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load .env.test if not in GitHub Actions
if (!process.env.GITHUB_ACTIONS) {
  config({ path: resolve(__dirname, '.env.test') })
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
  },
})
