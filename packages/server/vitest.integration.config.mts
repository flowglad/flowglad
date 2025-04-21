import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 60000, // 60 seconds
    hookTimeout: 60000, // 60 seconds
    setupFiles: ['./src/test/setup.ts'],
  },
})
