import { defineConfig } from '@trigger.dev/sdk'
import { esbuildPlugin } from '@trigger.dev/build/extensions'
import { sentryEsbuildPlugin } from '@sentry/esbuild-plugin'
import * as Sentry from '@sentry/node'
import { puppeteer } from '@trigger.dev/build/extensions/puppeteer'
import {
  additionalFiles,
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
      esbuildPlugin(
        sentryEsbuildPlugin({
          org: process.env.SENTRY_ORG as string,
          project: process.env.SENTRY_PROJECT as string,
          authToken: process.env.SENTRY_AUTH_TOKEN,
        }),
        { placement: 'last', target: 'deploy' }
      ),
      additionalFiles({
        files: ['./public/fonts/**'],
      }),
    ],
  },
  init: async () => {
    Sentry.init({
      defaultIntegrations: false,
      dsn: process.env.SENTRY_DSN,
      environment:
        process.env.NODE_ENV === 'production'
          ? 'production'
          : 'development',
    })
  },
  onFailure: async ({ payload, error, ctx }) => {
    Sentry.captureException(error, {
      extra: {
        payload,
        ctx,
      },
    })
  },
})
