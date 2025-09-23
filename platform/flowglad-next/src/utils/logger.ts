// utils/logger.ts
import { log as logtailLog } from '@logtail/next'
import { trace } from '@opentelemetry/api'
import core, { IS_DEV } from './core'

const log = IS_DEV || !core.IS_PROD ? console : logtailLog

type LogData = Record<string, any>

// Helper to enrich log data with trace context
function enrichWithTraceContext(data: LogData = {}): LogData {
  const span = trace.getActiveSpan()
  if (!span) return data

  const spanContext = span.spanContext()
  return {
    ...data,
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
    trace_flags: spanContext.traceFlags.toString(),
  }
}

export const logger = {
  debug: (message: string, data?: LogData) => {
    log.debug(message, enrichWithTraceContext(data))
  },

  info: (message: string, data?: LogData) => {
    log.info(message, enrichWithTraceContext(data))
  },

  warn: (message: string, data?: LogData) => {
    log.warn(message, enrichWithTraceContext(data))
  },

  error: (message: string | Error, data?: LogData) => {
    const enrichedData = enrichWithTraceContext(data)

    if (message instanceof Error) {
      const span = trace.getActiveSpan()
      if (span) {
        span.recordException(message)
      }

      log.error(message.message, {
        ...enrichedData,
        error_name: message.name,
        error_stack: message.stack,
      })
    } else {
      log.error(message, enrichedData)
    }
  },
}
