import { defineConfig } from '@trigger.dev/sdk'
import { puppeteer } from '@trigger.dev/build/extensions/puppeteer'
import {
  additionalFiles,
  additionalPackages,
  syncVercelEnvVars,
} from '@trigger.dev/build/extensions/core'

export default defineConfig({
  project: 'proj_nrfpgtxovaftyxkxlako',
  // project: process.env.TRIGGER_PROJECT_ID!,
  logLevel: 'log',
  machine: 'medium-2x',
  maxDuration: 60000,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    /**
     * Puppeteer and related packages should be externalized to avoid
     * path resolution problems during the bundle process.
     */
    external: [
      'chromium-bidi',
      'puppeteer-core',
      '@sparticuz/chromium',
      'puppeteer',
    ],
    extensions: [
      syncVercelEnvVars(),
      puppeteer(),
      additionalFiles({
        files: ['./public/fonts/**'],
      }),
    ],
  },
})
