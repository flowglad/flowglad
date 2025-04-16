import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30000, // 30 seconds
    hookTimeout: 30000, // 30 seconds
    setupFiles: ['./src/test/setup.ts'],
  },
})
