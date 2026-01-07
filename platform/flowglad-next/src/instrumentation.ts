import { log } from '@logtail/next'
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base'
import { registerOTel } from '@vercel/otel'

export async function register() {
  // Save original env variables
  const originalOtelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  const originalOtelHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS

  try {
    // Set our custom variables in the process.env for OpenTelemetry initialization
    // Trigger.dev depends on these variables,
    // so setting them will break trigger.dev builds
    if (process.env.FLOWGLAD_OTEL_ENDPOINT) {
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT =
        process.env.FLOWGLAD_OTEL_ENDPOINT
    }

    if (process.env.FLOWGLAD_OTEL_HEADERS) {
      process.env.OTEL_EXPORTER_OTLP_HEADERS =
        process.env.FLOWGLAD_OTEL_HEADERS
    }

    // Parse sample rate (default to 1.0 = 100% sampling)
    const sampleRate = parseFloat(
      process.env.FLOWGLAD_TRACE_SAMPLE_RATE || '1.0'
    )
    const validSampleRate = Math.max(
      0,
      Math.min(1, isNaN(sampleRate) ? 1 : sampleRate)
    )

    // Use parent-based sampling so child spans inherit parent's sampling decision
    // Only create custom sampler if rate < 1, otherwise use default (always sample)
    const sampler =
      validSampleRate < 1
        ? new ParentBasedSampler({
            root: new TraceIdRatioBasedSampler(validSampleRate),
          })
        : undefined

    // Register OpenTelemetry with our custom service name
    registerOTel({
      serviceName:
        process.env.FLOWGLAD_OTEL_SERVICE_NAME || 'flowglad-api',
      traceSampler: sampler,
      // Disable @vercel/otel's fetch instrumentation to avoid duplicate spans.
      // Sentry's @opentelemetry/instrumentation-http (initialized in sentry.server.config.ts)
      // already instruments HTTP/fetch requests with standard semantic conventions.
      // If we move off Sentry, re-enable this by removing the line below or setting
      // instrumentations: ['fetch'] to restore HTTP span creation.
      instrumentations: [],
      attributes: {
        'deployment.environment':
          process.env.FLOWGLAD_OTEL_ENV ||
          process.env.VERCEL_ENV ||
          process.env.NODE_ENV ||
          'unknown',
        'host.id': process.env.VERCEL_DEPLOYMENT_ID || 'localhost',
        ...(process.env.VERCEL_GIT_COMMIT_SHA && {
          'vcs.commit.id': process.env.VERCEL_GIT_COMMIT_SHA,
        }),
        ...(process.env.VERCEL_GIT_COMMIT_REF && {
          'vcs.branch': process.env.VERCEL_GIT_COMMIT_REF,
        }),
      },
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
