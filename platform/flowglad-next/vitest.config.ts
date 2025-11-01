import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    test: {
      include: [
        'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      ],
      environment: 'jsdom',
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
