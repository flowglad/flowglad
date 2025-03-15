import { log } from '@logtail/next'
import { registerOTel } from '@vercel/otel'

export async function register() {
  // Save original env variables
  const originalOtelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  const originalOtelHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS

  try {
    // Set our custom variables in the process.env for OpenTelemetry initialization
    if (process.env.FLOWGLAD_OTEL_ENDPOINT) {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT =
        process.env.FLOWGLAD_OTEL_ENDPOINT
    }

    if (process.env.FLOWGLAD_OTEL_HEADERS) {
      process.env.OTEL_EXPORTER_OTLP_HEADERS =
        process.env.FLOWGLAD_OTEL_HEADERS
    }

    // Register OpenTelemetry with our custom service name
    registerOTel({
      serviceName:
        process.env.FLOWGLAD_OTEL_SERVICE_NAME || 'flowglad-api',
    })
  } finally {
    // Restore original variables for trigger.dev to use
    if (originalOtelEndpoint !== undefined) {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalOtelEndpoint
    } else {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    }

    if (originalOtelHeaders !== undefined) {
      process.env.OTEL_EXPORTER_OTLP_HEADERS = originalOtelHeaders
    } else {
      delete process.env.OTEL_EXPORTER_OTLP_HEADERS
    }
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('../sentry.server.config')

    log.info('Node.js runtime initialized with OpenTelemetry', {
      environment:
        process.env.FLOWGLAD_OTEL_ENV ||
        process.env.NODE_ENV ||
        'unknown',
      timestamp: new Date().toISOString(),
      service:
        process.env.FLOWGLAD_OTEL_SERVICE_NAME || 'flowglad-api',
    })
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('../sentry.edge.config')

    log.info('Edge runtime initialized', {
      environment:
        process.env.FLOWGLAD_OTEL_ENV ||
        process.env.NODE_ENV ||
        'unknown',
      timestamp: new Date().toISOString(),
      service:
        process.env.FLOWGLAD_OTEL_SERVICE_NAME || 'flowglad-api',
    })
  }
}
