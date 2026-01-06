import {
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api'

export type TracerName =
  | 'db.transaction'
  | 'stripe'
  | 'cloudflare.r2'
  | 'svix'
  | 'trigger'
  | 'resend'

export const getTracer = (name: TracerName) => trace.getTracer(name)

export interface TraceOptions {
  spanName: string
  tracerName: TracerName
  kind?: SpanKind
  attributes?: Record<string, string | number | boolean | undefined>
}

/**
 * Wraps an async function in an OpenTelemetry span with consistent error handling.
 *
 * - Automatically filters out undefined attributes
 * - Records duration_ms on completion
 * - Sets OK status on success, ERROR status on failure
 * - Records exceptions and rethrows errors
 *
 * @example
 * ```ts
 * const result = await withSpan(
 *   {
 *     spanName: 'stripe.customers.create',
 *     tracerName: 'stripe',
 *     kind: SpanKind.CLIENT,
 *     attributes: { 'stripe.org_id': orgId, 'stripe.livemode': livemode },
 *   },
 *   async (span) => {
 *     // span is available if you need to add more attributes mid-execution
 *     return stripe.customers.create({ ... })
 *   }
 * )
 * ```
 */
export const withSpan = async <T>(
  options: TraceOptions,
  fn: (span: Span) => Promise<T>
): Promise<T> => {
  const tracer = getTracer(options.tracerName)
  return tracer.startActiveSpan(
    options.spanName,
    { kind: options.kind ?? SpanKind.INTERNAL },
    async (span) => {
      if (options.attributes) {
        // Filter out undefined values before setting attributes
        const filteredAttributes = Object.fromEntries(
          Object.entries(options.attributes).filter(
            ([_, v]) => v !== undefined
          )
        ) as Record<string, string | number | boolean>
        span.setAttributes(filteredAttributes)
      }
      const startTime = Date.now()
      try {
        const result = await fn(span)
        span.setAttributes({ duration_ms: Date.now() - startTime })
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        span.recordException(error as Error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        })
        throw error
      } finally {
        span.end()
      }
    }
  )
}
