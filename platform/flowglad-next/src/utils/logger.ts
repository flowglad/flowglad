// utils/logger.ts
import { log as logtailLog } from '@logtail/next'
import {
  context,
  type Span,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api'
import type {
  ApiEnvironment,
  LogData,
  LoggerData,
  ServiceContext,
} from '@/types'
import core, { IS_DEV } from './core'

const log = IS_DEV || !core.IS_PROD ? console : logtailLog

// Helper to determine service context based on API key presence
function getServiceContext(apiKey?: string): ServiceContext {
  // If we're on the client-side, it's always webapp
  if (typeof window !== 'undefined') {
    return 'webapp'
  }

  // Server-side: if there's an API key, it's an API request
  // If no API key, it's a webapp request (TRPC, SSR, etc.)
  return apiKey ? 'api' : 'webapp'
}

// Helper to enrich log data with trace context and service metadata
function enrichWithContext(
  data: LogData = {},
  overrides?: {
    service?: ServiceContext
    apiEnvironment?: ApiEnvironment
    apiKey?: string
    span?: Span
  }
): LogData {
  // Try to get span from: 1) explicit param, 2) getActiveSpan(), 3) context.active()
  const span =
    overrides?.span ??
    trace.getActiveSpan() ??
    trace.getSpan(context.active())

  const enrichedData: LogData = {
    ...data,
    service:
      overrides?.service ??
      data.service ??
      getServiceContext(overrides?.apiKey),
    deployment_env: core.IS_PROD
      ? 'production'
      : core.IS_TEST
        ? 'test'
        : 'development',
    'host.id': process.env.VERCEL_DEPLOYMENT_ID || 'localhost',
    ...(process.env.VERCEL_GIT_COMMIT_SHA && {
      'vcs.commit.id': process.env.VERCEL_GIT_COMMIT_SHA,
    }),
    ...(process.env.VERCEL_GIT_COMMIT_REF && {
      'vcs.branch': process.env.VERCEL_GIT_COMMIT_REF,
    }),
  }

  // Add API environment if provided or if we can detect it
  if (overrides?.apiEnvironment || data.apiEnvironment) {
    enrichedData.api_environment =
      overrides?.apiEnvironment ?? data.apiEnvironment
  }

  // Add trace context if available
  if (span) {
    const spanContext = span.spanContext()
    const traceId = spanContext.traceId
    const spanId = spanContext.spanId
    const traceFlags = spanContext.traceFlags.toString()

    // Better Stack expects 'span.trace_id' and 'span.span_id' at root level for the Trace ID column.
    // Since @logtail/next wraps all data under 'fields', we use 'span.trace_id' as the field name
    // and configure a VRL transformation in Better Stack to move it to root level:
    //   .span.trace_id = del(.fields."span.trace_id")
    //   .span.span_id = del(.fields."span.span_id")
    // See: https://betterstack.com/docs/logs/tracing/intro/
    enrichedData['span.trace_id'] = traceId
    enrichedData['span.span_id'] = spanId
    enrichedData.trace_flags = traceFlags
  }

  // Add runtime context for better filtering
  if (typeof window === 'undefined' && process.env.NEXT_RUNTIME) {
    enrichedData.runtime = process.env.NEXT_RUNTIME
  }

  return enrichedData
}

interface LoggerDataWithApiKey extends LoggerData {
  apiKey?: string
  /**
   * Optionally pass an explicit span to associate with this log.
   * This is useful when logging inside a `startActiveSpan` callback
   * where context propagation may not work automatically.
   */
  span?: Span
}

// Helper function to handle the common logging pattern
function logWithContext(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string | Error,
  data?: LoggerDataWithApiKey
) {
  const { service, apiEnvironment, apiKey, span, ...restData } =
    data || {}
  const enrichedData = enrichWithContext(restData, {
    service,
    apiEnvironment,
    apiKey,
    span,
  })

  if (level === 'error' && message instanceof Error) {
    const activeSpan =
      span ?? trace.getActiveSpan() ?? trace.getSpan(context.active())
    if (activeSpan) {
      activeSpan.recordException(message)
      activeSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: message.message,
      })
    }
    log.error(message.message, {
      ...enrichedData,
      error_name: message.name,
      error_stack: message.stack,
    })
  } else {
    log[level](message as string, enrichedData)
  }
}

export const logger = {
  debug: (message: string, data?: LoggerDataWithApiKey) => {
    logWithContext('debug', message, data)
  },

  info: (message: string, data?: LoggerDataWithApiKey) => {
    logWithContext('info', message, data)
  },

  warn: (message: string, data?: LoggerDataWithApiKey) => {
    logWithContext('warn', message, data)
  },

  error: (message: string | Error, data?: LoggerDataWithApiKey) => {
    logWithContext('error', message, data)
  },
}
