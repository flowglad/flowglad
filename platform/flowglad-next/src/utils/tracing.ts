/**
 * Tracing Utilities and Combinators
 *
 * This module provides OpenTelemetry tracing utilities with a combinator-based API
 * for separating tracing concerns from business logic.
 *
 * ## Public API
 * - `traced` - Primary combinator for adding tracing to functions
 * - `tracedWithCheckpoints` - For functions needing multiple span attribute updates
 * - `Checkpoint` - Type for the checkpoint callback function
 * - `r2Traced` - Pre-configured factory for Cloudflare R2 operations
 * - `resendTraced` - Pre-configured factory for Resend email operations
 *
 * @example Simple static tracing
 * ```ts
 * const doThing = async (x: number) => x * 2
 * const tracedDoThing = traced({ options: { spanName: 'doThing', tracerName: 'myTracer' } }, doThing)
 * ```
 *
 * @example Parameter-based attributes
 * ```ts
 * const putFile = async (key: string, body: Buffer) => { ... }
 * const tracedPutFile = traced(
 *   {
 *     options: { spanName: 'putFile', tracerName: 'storage' },
 *     extractArgsAttributes: (key, body) => ({ 'file.key': key, 'file.size': body.length }),
 *   },
 *   putFile
 * )
 * ```
 *
 * @example Multi-checkpoint tracing
 * ```ts
 * const verifyKey = async (checkpoint: Checkpoint, key: string) => {
 *   checkpoint({ 'key.prefix': key.slice(0, 8) })
 *   const cached = await checkCache(key)
 *   checkpoint({ 'cache.hit': !!cached })
 *   return cached ?? await fetchFromApi(key)
 * }
 * const tracedVerifyKey = tracedWithCheckpoints(
 *   { options: { spanName: 'verifyKey', tracerName: 'auth' } },
 *   verifyKey
 * )
 * ```
 */

import {
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api'

// ============================================================================
// Core Types
// ============================================================================

type TracerName =
  | 'db.transaction'
  | 'stripe'
  | 'cloudflare.r2'
  | 'svix'
  | 'trigger'
  | 'resend'
  | 'api-key-verification'

const getTracer = (name: TracerName) => trace.getTracer(name)

interface TraceOptions {
  spanName: string
  tracerName: TracerName
  kind?: SpanKind
  attributes?: Record<string, string | number | boolean | undefined>
}

/**
 * Attributes that can be set on a span.
 */
type SpanAttributes = Record<
  string,
  string | number | boolean | undefined
>

/**
 * Extracts span attributes from function arguments.
 */
type AttributeExtractor<TArgs extends unknown[]> = (
  ...args: TArgs
) => SpanAttributes

/**
 * Extracts span attributes from the function result.
 */
type ResultAttributeExtractor<TResult> = (
  result: TResult
) => SpanAttributes

/**
 * A checkpoint function for setting span attributes during execution.
 * This allows business logic to record telemetry without importing OpenTelemetry.
 */
export type Checkpoint = (attributes: SpanAttributes) => void

/**
 * A function that receives a checkpoint callback as its first parameter.
 */
type CheckpointFn<TArgs extends unknown[], TResult> = (
  checkpoint: Checkpoint,
  ...args: TArgs
) => Promise<TResult>

/**
 * Configuration for the traced combinator.
 */
interface TraceConfig<TArgs extends unknown[], TResult> {
  /** Static trace options or a function to compute them from args */
  options: TraceOptions | ((...args: TArgs) => TraceOptions)

  /** Extract additional attributes from arguments (optional) */
  extractArgsAttributes?: AttributeExtractor<TArgs>

  /** Extract attributes from the result (optional) */
  extractResultAttributes?: ResultAttributeExtractor<TResult>
}

/**
 * Configuration for the tracedWithCheckpoints combinator.
 */
interface CheckpointTraceConfig<TArgs extends unknown[]> {
  /** Static trace options or a function to compute them from args */
  options: TraceOptions | ((...args: TArgs) => TraceOptions)

  /** Extract additional attributes from arguments (optional) */
  extractArgsAttributes?: AttributeExtractor<TArgs>
}

/**
 * Configuration for creating a domain-specific tracer factory.
 */
interface DomainTracerConfig {
  tracerName: TracerName
  kind?: SpanKind
  spanPrefix?: string
  baseAttributes?: SpanAttributes
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Filter out undefined values from attributes object.
 */
function filterUndefinedAttributes(
  attributes: SpanAttributes
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(attributes).filter(([_, v]) => v !== undefined)
  ) as Record<string, string | number | boolean>
}

// ============================================================================
// Low-Level API
// ============================================================================

/**
 * Wraps an async function in an OpenTelemetry span with consistent error handling.
 *
 * NOTE: Prefer using the `traced` combinator instead of this function directly,
 * as it provides better separation of concerns.
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
const withSpan = async <T>(
  options: TraceOptions,
  fn: (span: Span) => Promise<T>
): Promise<T> => {
  const tracer = getTracer(options.tracerName)
  return tracer.startActiveSpan(
    options.spanName,
    { kind: options.kind ?? SpanKind.INTERNAL },
    async (span) => {
      if (options.attributes) {
        const filteredAttributes = filterUndefinedAttributes(
          options.attributes
        )
        span.setAttributes(filteredAttributes)
      }
      const startTime = Date.now()
      try {
        const result = await fn(span)
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
        span.setAttributes({ duration_ms: Date.now() - startTime })
        span.end()
      }
    }
  )
}

// ============================================================================
// Core Combinators
// ============================================================================

/**
 * The primary combinator for adding tracing to an async function.
 *
 * Supports three patterns:
 * 1. Static attributes - fixed TraceOptions
 * 2. Parameter-based attributes - computed from function arguments
 * 3. Result-based attributes - computed from function result
 *
 * @param config - Tracing configuration
 * @param fn - The function to trace
 * @returns A traced version of the function with identical signature
 */
export function traced<TArgs extends unknown[], TResult>(
  config: TraceConfig<TArgs, TResult>,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    // Compute trace options (static or dynamic)
    const traceOptions =
      typeof config.options === 'function'
        ? config.options(...args)
        : config.options

    // Compute argument-based attributes if extractor provided
    const argsAttributes = config.extractArgsAttributes
      ? config.extractArgsAttributes(...args)
      : undefined

    // Merge static and argument-based attributes
    const mergedAttributes = argsAttributes
      ? { ...traceOptions.attributes, ...argsAttributes }
      : traceOptions.attributes

    return withSpan(
      { ...traceOptions, attributes: mergedAttributes },
      async (span) => {
        const result = await fn(...args)

        // Set result-based attributes if extractor provided
        if (config.extractResultAttributes) {
          const resultAttributes =
            config.extractResultAttributes(result)
          const filtered = filterUndefinedAttributes(resultAttributes)
          span.setAttributes(filtered)
        }

        return result
      }
    )
  }
}

/**
 * Combinator for functions that need to set attributes at multiple points
 * during execution.
 *
 * The wrapped function receives a `checkpoint` callback as its first argument,
 * allowing it to set span attributes without directly importing OpenTelemetry.
 *
 * @param config - Tracing configuration
 * @param fn - The function to trace (receives checkpoint as first arg)
 * @returns A traced function that does not expose the checkpoint parameter
 */
export function tracedWithCheckpoints<
  TArgs extends unknown[],
  TResult,
>(
  config: CheckpointTraceConfig<TArgs>,
  fn: CheckpointFn<TArgs, TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    // Compute trace options (static or dynamic)
    const traceOptions =
      typeof config.options === 'function'
        ? config.options(...args)
        : config.options

    // Compute argument-based attributes if extractor provided
    const argsAttributes = config.extractArgsAttributes
      ? config.extractArgsAttributes(...args)
      : undefined

    const mergedAttributes = argsAttributes
      ? { ...traceOptions.attributes, ...argsAttributes }
      : traceOptions.attributes

    return withSpan(
      { ...traceOptions, attributes: mergedAttributes },
      async (span) => {
        // Create checkpoint function that sets attributes on the span
        const checkpoint: Checkpoint = (attributes) => {
          const filtered = filterUndefinedAttributes(attributes)
          span.setAttributes(filtered)
        }

        return fn(checkpoint, ...args)
      }
    )
  }
}

/**
 * Creates a tracer factory for a specific domain (e.g., R2, Resend, Stripe).
 *
 * This is useful when you have many operations in a domain that share
 * common tracing configuration.
 *
 * @param domainConfig - Domain-level tracing configuration
 * @returns A function that creates traced versions of operations
 */
function tracedMethod(domainConfig: DomainTracerConfig) {
  return function <TArgs extends unknown[], TResult>(
    operation: string,
    extractAttributes: AttributeExtractor<TArgs> | null,
    fn: (...args: TArgs) => Promise<TResult>
  ): (...args: TArgs) => Promise<TResult> {
    const spanName = domainConfig.spanPrefix
      ? `${domainConfig.spanPrefix}.${operation}`
      : operation

    const operationAttribute = domainConfig.spanPrefix
      ? { [`${domainConfig.spanPrefix}.operation`]: operation }
      : {}

    return traced(
      {
        options: {
          spanName,
          tracerName: domainConfig.tracerName,
          kind: domainConfig.kind,
          attributes: {
            ...domainConfig.baseAttributes,
            ...operationAttribute,
          },
        },
        extractArgsAttributes: extractAttributes ?? undefined,
      },
      fn
    )
  }
}

// ============================================================================
// Pre-configured Domain Factories
// ============================================================================

/**
 * Cloudflare R2 storage tracer factory.
 *
 * @example
 * ```ts
 * const putObject = r2Traced(
 *   'putObject',
 *   ({ key, body }) => ({ 'r2.key': key, 'r2.size_bytes': body.length }),
 *   async ({ key, body }) => { ... }
 * )
 * ```
 */
export const r2Traced = tracedMethod({
  tracerName: 'cloudflare.r2',
  kind: SpanKind.CLIENT,
  spanPrefix: 'r2',
})

/**
 * Resend email tracer factory.
 *
 * @example
 * ```ts
 * const sendEmail = resendTraced(
 *   'emails.send',
 *   (email) => ({ 'resend.recipient_count': email.to.length }),
 *   async (email) => { ... }
 * )
 * ```
 */
export const resendTraced = tracedMethod({
  tracerName: 'resend',
  kind: SpanKind.CLIENT,
  spanPrefix: 'resend',
})

/**
 * Svix webhook tracer factory.
 *
 * @example
 * ```ts
 * const sendMessage = svixTraced(
 *   'message.create',
 *   (params) => ({ 'svix.app_id': params.applicationId }),
 *   async (params) => { ... }
 * )
 * ```
 */
export const svixTraced = tracedMethod({
  tracerName: 'svix',
  kind: SpanKind.CLIENT,
  spanPrefix: 'svix',
})
