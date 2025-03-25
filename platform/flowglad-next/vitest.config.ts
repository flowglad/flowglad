import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  return {
    plugins: [react()],
    test: {
      // testTimeout: 20000,
      // pool: 'forks', // Important - prevents console swallowing
      // poolOptions: {
      //   // threads: {
      //   //   singleThread: true,
      //   // },
      // },
      include: [
        'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
      ],
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
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
