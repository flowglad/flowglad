// trpc/tracingMiddleware.ts
import { TRPCError } from '@trpc/server'
import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api'
import { logger } from '@/utils/logger'
import { TRPCContext } from './trpcContext'
import { FlowgladTRPC } from './coreTrpcObject'

export function createTracingMiddleware() {
  const tracer = trace.getTracer('trpc-api')
  return (t: FlowgladTRPC) => {
    return t.middleware<TRPCContext>(
      async ({ path, type, next, getRawInput, ctx }) => {
        const rawInput = await getRawInput()
        const { user, apiKey, organizationId, environment } =
          ctx as TRPCContext
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

            // Log request start
            logger.info(`TRPC Request: ${type} ${path}`, {
              type,
              path,
              has_input: rawInput !== undefined,
              input: rawInput,
              auth_type: apiKey ? 'api_key' : user ? 'user' : 'none',
            })

            try {
              // Execute the operation
              const result = await next()

              // Operation succeeded
              span.setStatus({ code: SpanStatusCode.OK })

              // Log request end
              const duration = Date.now() - startTime
              logger.info(`TRPC Success: ${type} ${path}`, {
                type,
                path,
                duration_ms: duration,
              })

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

              // Set error attributes on span
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
              })

              // Log the error
              const duration = Date.now() - startTime
              logger.error(
                error instanceof Error
                  ? error
                  : new Error(String(error)),
                {
                  type,
                  path,
                  error_code: errorCode,
                  duration_ms: duration,
                }
              )

              // Re-throw the error
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
