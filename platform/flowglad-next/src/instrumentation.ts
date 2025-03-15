import { log } from '@logtail/next'
import { registerOTel } from '@vercel/otel'

export async function register() {
  // Register OpenTelemetry first
  registerOTel({
    serviceName: 'flowglad-api',
  })

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')

    log.info('Node.js runtime initialized with OpenTelemetry', {
      environment: process.env.NODE_ENV || 'unknown',
      timestamp: new Date().toISOString(),
      service: 'flowglad-api',
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')

    log.info('Edge runtime initialized', {
      environment: process.env.NODE_ENV || 'unknown',
      timestamp: new Date().toISOString(),
      service: 'flowglad-api',
    })
  }
}
