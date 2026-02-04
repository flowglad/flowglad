// trpc/tracingMiddleware.ts

import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api'
import { TRPCError } from '@trpc/server'
import { logger } from '@/utils/logger'
import type { FlowgladTRPC } from './coreTrpcObject'
import type { TRPCContext } from './trpcContext'

export function createTracingMiddleware() {
  const tracer = trace.getTracer('trpc-api')
  return (t: FlowgladTRPC) => {
    return t.middleware<TRPCContext>(
      async ({ path, type, next, getRawInput, ctx }) => {
        const requestId = crypto.randomUUID().slice(0, 8) // Taking first 8 chars for brevity
        const rawInput = await getRawInput()
        const { user, apiKey, organizationId, environment } =
          ctx as TRPCContext

        // This will automatically become a child span of any active parent span
        return tracer.startActiveSpan(
          `TRPC ${type} ${path}`,
          { kind: SpanKind.SERVER },
          async (span) => {
            const startTime = Date.now()

            // Add context attributes to span
            span.setAttributes({
              'trpc.path': path,
              'trpc.type': type,
              'trpc.input':
                typeof rawInput === 'undefined'
                  ? 'undefined'
                  : JSON.stringify(rawInput).substring(0, 1000),
              'rpc.method': path,
              'rpc.service': 'flowglad-api',
              'rpc.system': 'trpc',
            })

            // Add auth context if available
            if (user) {
              span.setAttributes({
                'enduser.id': user.id,
              })
            }

            // Add API key info (without revealing the key)
            if (apiKey) {
              span.setAttributes({
                'api.authenticated': true,
              })
            }

            // Add organization context if available
            if (organizationId) {
              span.setAttributes({
                'organization.id': organizationId,
              })
            }

            // Add environment info if available
            if (environment) {
              span.setAttributes({
                'deployment.environment': environment,
              })
            }
            const service = apiKey ? 'api' : 'webapp'
            // Log request start - pass span explicitly for trace context
            logger.info(
              `[${requestId}] 🟡 TRPC Request: ${type} ${path}`,
              {
                service,
                apiEnvironment: environment,
                requestId,
                type,
                path,
                has_input: rawInput !== undefined,
                input: rawInput,
                organization_id: organizationId,
                auth_type: apiKey
                  ? 'api_key'
                  : user
                    ? 'user'
                    : 'none',
                span, // Pass span explicitly for trace correlation
              }
            )

            try {
              // Execute the operation
              const result = await next()

              // Operation succeeded
              span.setStatus({ code: SpanStatusCode.OK })

              // Log request end
              const duration = Date.now() - startTime
              logger.info(
                `[${requestId}] 🟢 TRPC Success: ${type} ${path}`,
                {
                  service,
                  apiEnvironment: environment,
                  requestId,
                  type,
                  path,
                  duration_ms: duration,
                  span, // Pass span explicitly for trace correlation
                }
              )

              return result
            } catch (error) {
              // Record error details
              const isTRPCError = error instanceof TRPCError
              const errorCode = isTRPCError
                ? error.code
                : 'INTERNAL_SERVER_ERROR'
              const errorMessage = isTRPCError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : String(error)

              // Enhanced error attributes
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: errorMessage,
              })

              span.setAttributes({
                'error.type': isTRPCError
                  ? `TRPC.${errorCode}`
                  : error instanceof Error
                    ? error.name
                    : 'Unknown',
                'error.message': errorMessage,
                'error.code': errorCode,
                'error.stack':
                  error instanceof Error ? error.stack : undefined,
                'error.cause':
                  error instanceof Error
                    ? String(error.cause)
                    : undefined,
                'error.details': isTRPCError
                  ? JSON.stringify(error.cause)
                  : undefined,
              })

              // Record error event with additional context
              span.addEvent('error', {
                'error.object': JSON.stringify({
                  message: errorMessage,
                  code: errorCode,
                  stack:
                    error instanceof Error ? error.stack : undefined,
                  timestamp: new Date().toISOString(),
                }),
              })

              // Log the error
              const duration = Date.now() - startTime
              logger.error(
                `[${requestId}] 🔴 TRPC Error: ${type} ${path}`,
                {
                  service,
                  apiEnvironment: environment,
                  error:
                    error instanceof Error
                      ? error
                      : new Error(String(error)),
                  requestId,
                  type,
                  path,
                  error_code: errorCode,
                  duration_ms: duration,
                  organization_id: organizationId,
                  span, // Pass span explicitly for trace correlation
                }
              )

              // biome-ignore lint/plugin: Re-throw unexpected errors after handling known error types
              throw error
            } finally {
              span.end()
            }
          }
        )
      }
    )
  }
}
