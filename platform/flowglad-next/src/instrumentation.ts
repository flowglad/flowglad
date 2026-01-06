import { log } from '@logtail/next'
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base'
import { registerOTel } from '@vercel/otel'

/**
 * Configure and register OpenTelemetry, then initialize runtime-specific Sentry and logging.
 *
 * Temporarily overrides OTLP endpoint and headers from `FLOWGLAD_OTEL_ENDPOINT` and
 * `FLOWGLAD_OTEL_HEADERS` while registering OpenTelemetry, parses `FLOWGLAD_TRACE_SAMPLE_RATE`
 * (clamped to the range 0–1) and, when less than 1, installs a sampling strategy that respects
 * parent sampling decisions. Calls `registerOTel` with the configured service name
 * (from `FLOWGLAD_OTEL_SERVICE_NAME` or `flowglad-api`). Restores the original OTLP-related
 * environment variables afterwards. Afterwards, imports the appropriate Sentry configuration
 * for the current `NEXT_RUNTIME` (`nodejs` or `edge`) and emits an informational log entry.
 */
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