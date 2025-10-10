// utils/logger.ts
import { log as logtailLog } from '@logtail/next'
import { trace, context, SpanStatusCode } from '@opentelemetry/api'
import core, { IS_DEV } from './core'
import { ServiceContext, ApiEnvironment, LogData } from '@/types'

const log = IS_DEV || !core.IS_PROD ? console : logtailLog

// Helper to determine service context based on runtime and request path
function getServiceContext(): ServiceContext {
  // Check if we're in an API route context
  if (typeof window === 'undefined') {
    // Server-side: check for API route patterns
    const isApiRoute =
      process.env.NEXT_RUNTIME === 'edge' ||
      process.env.NEXT_RUNTIME === 'nodejs'

    // We'll default to 'api' for server-side code that's likely API-related
    // This can be overridden when calling the logger
    return 'api'
  }

  // Client-side is always webapp
  return 'webapp'
}

// Helper to enrich log data with trace context and service metadata
function enrichWithContext(data: LogData = {}, overrides?: {
  service?: ServiceContext,
  apiEnvironment?: ApiEnvironment
}): LogData {
  const span = trace.getActiveSpan()

  const enrichedData: LogData = {
    ...data,
    service: overrides?.service ?? data.service ?? getServiceContext(),
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
  data?: LogData & { service?: ServiceContext; apiEnvironment?: ApiEnvironment }
) {
  const { service, apiEnvironment, ...restData } = data || {}
  const enrichedData = enrichWithContext(restData, { service, apiEnvironment })

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
  debug: (message: string, data?: LogData & { service?: ServiceContext; apiEnvironment?: ApiEnvironment }) => {
    logWithContext('debug', message, data)
  },

  info: (message: string, data?: LogData & { service?: ServiceContext; apiEnvironment?: ApiEnvironment }) => {
    logWithContext('info', message, data)
  },

  warn: (message: string, data?: LogData & { service?: ServiceContext; apiEnvironment?: ApiEnvironment }) => {
    logWithContext('warn', message, data)
  },

  error: (message: string | Error, data?: LogData & { service?: ServiceContext; apiEnvironment?: ApiEnvironment }) => {
    logWithContext('error', message, data)
  },
}
