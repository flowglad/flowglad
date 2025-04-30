const { defineConfig } = require('vitest/config')
// import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    /**
     * Exclude generated styles to prevent infinite re-runs
     * looped by the script re-executing during the setup step
     */
    exclude: ['**/generated/styles.ts', '**/node_modules/**'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
