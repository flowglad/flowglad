// utils/logger.ts
import { log as logtailLog } from '@logtail/next'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'
import core, { IS_DEV } from './core'
import { ServiceContext, ApiEnvironment, LogData, LoggerData } from '@/types'

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
function enrichWithContext(data: LogData = {}, overrides?: {
  service?: ServiceContext,
  apiEnvironment?: ApiEnvironment,
  apiKey?: string
}): LogData {
  const span = trace.getActiveSpan()

  const enrichedData: LogData = {
    ...data,
    service: overrides?.service ?? data.service ?? getServiceContext(overrides?.apiKey),
    deployment_env: core.IS_PROD ? 'production' : core.IS_TEST ? 'test' : 'development',
  }

  // Add API environment if provided or if we can detect it
  if (overrides?.apiEnvironment || data.apiEnvironment) {
    enrichedData.api_environment = overrides?.apiEnvironment ?? data.apiEnvironment
  }

  // Add trace context if available
  if (span) {
    const spanContext = span.spanContext()
    enrichedData.trace_id = spanContext.traceId
    enrichedData.span_id = spanContext.spanId
    enrichedData.trace_flags = spanContext.traceFlags.toString()
  }

  // Add runtime context for better filtering
  if (typeof window === 'undefined' && process.env.NEXT_RUNTIME) {
    enrichedData.runtime = process.env.NEXT_RUNTIME
  }

  return enrichedData
}

// Helper function to handle the common logging pattern
function logWithContext(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string | Error,
  data?: LoggerData & { apiKey?: string }
) {
  const { service, apiEnvironment, apiKey, ...restData } = data || {}
  const enrichedData = enrichWithContext(restData, { service, apiEnvironment, apiKey })

  if (level === 'error' && message instanceof Error) {
    const span = trace.getActiveSpan()
    if (span) {
      span.recordException(message)
      span.setStatus({ code: SpanStatusCode.ERROR, message: message.message })
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
  debug: (message: string, data?: LoggerData & { apiKey?: string }) => {
    logWithContext('debug', message, data)
  },

  info: (message: string, data?: LoggerData & { apiKey?: string }) => {
    logWithContext('info', message, data)
  },

  warn: (message: string, data?: LoggerData & { apiKey?: string }) => {
    logWithContext('warn', message, data)
  },

  error: (message: string | Error, data?: LoggerData & { apiKey?: string }) => {
    logWithContext('error', message, data)
  },
}
