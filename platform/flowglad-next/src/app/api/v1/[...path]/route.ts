import {
  FetchCreateContextFn,
  fetchRequestHandler,
} from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server'
import { createApiContext } from '@/server/trpcContext'
import { NextRequestWithUnkeyContext } from '@unkey/nextjs'
import { ApiEnvironment, FlowgladApiKeyType } from '@/types'
import { NextResponse } from 'next/server'
import { trpcToRest, RouteConfig } from '@/utils/openapi'
import * as Sentry from '@sentry/nextjs'
import {
  customerBillingRouteConfig,
  customersRouteConfigs,
} from '@/server/routers/customersRouter'
import { productsRouteConfigs } from '@/server/routers/productsRouter'
import { subscriptionsRouteConfigs } from '@/server/routers/subscriptionsRouter'
import { checkoutSessionsRouteConfigs } from '@/server/routers/checkoutSessionsRouter'
import { discountsRouteConfigs } from '@/server/routers/discountsRouter'
import { pricesRouteConfigs } from '@/server/routers/pricesRouter'
import { invoicesRouteConfigs } from '@/server/routers/invoicesRouter'
import { paymentMethodsRouteConfigs } from '@/server/routers/paymentMethodsRouter'
import { purchasesRouteConfigs } from '@/server/routers/purchasesRouter'
import { usageEventsRouteConfigs } from '@/server/routers/usageEventsRouter'
import { usageMetersRouteConfigs } from '@/server/routers/usageMetersRouter'
import { webhooksRouteConfigs } from '@/server/routers/webhooksRouter'
import {
  trace,
  SpanStatusCode,
  context,
  SpanKind,
} from '@opentelemetry/api'
import { logger } from '@/utils/logger'
import {
  pricingModelsRouteConfigs,
  getDefaultPricingModelRouteConfig,
  setupPricingModelRouteConfig,
} from '@/server/routers/pricingModelsRouter'
import {
  paymentsRouteConfigs,
  refundPaymentRouteConfig,
} from '@/server/routers/paymentsRouter'
import core from '@/utils/core'
import { parseUnkeyMeta, verifyApiKey } from '@/utils/unkey'
import { featuresRouteConfigs } from '@/server/routers/featuresRouter'
import { productFeaturesRouteConfigs } from '@/server/routers/productFeaturesRouter'
import { subscriptionItemFeaturesRouteConfigs } from '@/server/routers/subscriptionItemFeaturesRouter'
import { headers } from 'next/headers'
import {
  parsePaginationParams,
  parseAndValidateCursor,
  type PaginationParams,
} from '@/utils/pagination'
import { searchParamsToObject } from '@/utils/url'
import {
  trackSecurityEvent,
  trackFailedAuth,
  checkForExpiredKeyUsage,
} from '@/utils/securityTelemetry'
import { getApiKeyHeader } from '@/utils/apiKeyHelpers'

interface FlowgladRESTRouteContext {
  params: Promise<{ path: string[] }>
}

const parseErrorMessage = (rawMessage: string) => {
  let parsedMessage = rawMessage
  try {
    parsedMessage = JSON.parse(rawMessage)
  } catch (error) {
    return rawMessage
  }
  return parsedMessage
}

const routeConfigs = [
  ...customersRouteConfigs,
  ...subscriptionsRouteConfigs,
  ...checkoutSessionsRouteConfigs,
  ...pricesRouteConfigs,
  ...invoicesRouteConfigs,
  ...paymentMethodsRouteConfigs,
  ...paymentsRouteConfigs,
  ...purchasesRouteConfigs,
  ...pricingModelsRouteConfigs,
  ...usageMetersRouteConfigs,
  ...usageEventsRouteConfigs,
  ...webhooksRouteConfigs,
  ...featuresRouteConfigs,
  ...productFeaturesRouteConfigs,
]

const arrayRoutes: Record<string, RouteConfig> = routeConfigs.reduce(
  (acc, route) => {
    return { ...acc, ...route }
  },
  {} as Record<string, RouteConfig>
)

const routes: Record<string, RouteConfig> = {
  ...getDefaultPricingModelRouteConfig,
  ...setupPricingModelRouteConfig,
  ...refundPaymentRouteConfig,
  ...customerBillingRouteConfig,
  ...discountsRouteConfigs,
  ...productsRouteConfigs,
  ...subscriptionItemFeaturesRouteConfigs,
  ...trpcToRest('utils.ping'),
  // note it's important to add the array routes last
  // because the more specific patterns above will match first,
  // so e.g. /pricing-models/default will not attempt to match to /pricing-models/:id => id="default"
  ...arrayRoutes,
} as const

type TRPCResponse =
  | {
      error: {
        json: {
          message: string
          code: number
          data: {
            code: string
            httpStatus: number
            stack: string
          }
        }
      }
      result: undefined
    }
  | {
      result: {
        data: {
          json: JSON
        }
      }
    }

const innerHandler = async (
  req: NextRequestWithUnkeyContext,
  { params }: FlowgladRESTRouteContext
) => {
  const tracer = trace.getTracer('rest-api')
  const requestId = crypto.randomUUID().slice(0, 8)
  const requestStartTime = Date.now()

  return tracer.startActiveSpan(
    `REST ${req.method}`,
    { kind: SpanKind.SERVER },
    async (parentSpan) => {
      // Extract SDK version from headers
      const sdkVersion =
        req.headers.get('X-Stainless-Package-Version') || undefined

      try {
        // Track request body size for POST/PUT
        let requestBodySize = 0
        if (req.method === 'POST' || req.method === 'PUT') {
          const contentLength = req.headers.get('content-length')
          if (contentLength) {
            requestBodySize = parseInt(contentLength, 10)
          }
        }

        if (!req.unkey) {
          parentSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Unauthorized',
          })
          parentSpan.setAttributes({
            'error.type': 'AUTH_ERROR',
            'error.category': 'AUTH_ERROR',
            'http.status_code': 401,
            'request.id': requestId,
          })
          logger.error('REST API Unauthorized: No unkey context', {
            service: 'api',
            request_id: requestId,
            method: req.method,
            url: req.url,
          })
          return new Response('Unauthorized', { status: 401 })
        }

        const path = (await params).path.join('/')

        // Extract organization context
        const unkeyMeta = parseUnkeyMeta(req.unkey?.meta)
        const organizationId =
          unkeyMeta.organizationId || req.unkey?.ownerId!
        const organizationIdSource = unkeyMeta.organizationId
          ? 'metadata'
          : 'owner_id'
        const userId =
          unkeyMeta.type === FlowgladApiKeyType.Secret
            ? unkeyMeta.userId
            : undefined
        const apiKeyType = unkeyMeta.type || 'unknown'

        parentSpan.setAttributes({
          'http.method': req.method,
          'http.path': path,
          'http.url': req.url,
          'http.target': path,
          'http.scheme': 'https',
          'request.id': requestId,
          'request.body_size_bytes': requestBodySize,
          'organization.id': organizationId,
          'organization.id_source': organizationIdSource,
          'user.id': userId,
          'api.environment': req.unkey?.environment || 'unknown',
          'api.key_type': apiKeyType,
          rest_sdk_version: sdkVersion,
        })

        logger.info(`[${requestId}] REST API Request Started`, {
          service: 'api',
          apiEnvironment: req.unkey?.environment as ApiEnvironment,
          request_id: requestId,
          method: req.method,
          path,
          organization_id: organizationId,
          organization_id_source: organizationIdSource,
          user_id: userId,
          environment: req.unkey?.environment,
          api_key_type: apiKeyType,
          body_size_bytes: requestBodySize,
          rest_sdk_version: sdkVersion,
        })

        // Create a new context with our parent span
        const ctx = trace.setSpan(context.active(), parentSpan)

        // Find matching route with telemetry
        const routeMatchingStartTime = Date.now()
        const matchingRoute = Object.entries(routes).find(
          ([key, config]) => {
            const [routeMethod, routePath] = key.split(' ')
            return (
              req.method === routeMethod && config.pattern.test(path)
            )
          }
        )
        const routeMatchingDuration =
          Date.now() - routeMatchingStartTime

        if (!matchingRoute) {
          parentSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Not Found',
          })
          parentSpan.setAttributes({
            'error.type': 'NOT_FOUND',
            'error.category': 'NOT_FOUND',
            'http.status_code': 404,
            'route.matching_duration_ms': routeMatchingDuration,
            'route.found': false,
          })

          logger.warn(`[${requestId}] REST API Route Not Found`, {
            service: 'api',
            apiEnvironment: req.unkey?.environment as ApiEnvironment,
            request_id: requestId,
            method: req.method,
            path,
            route_matching_duration_ms: routeMatchingDuration,
            available_routes: Object.keys(routes).length,
          })

          return new Response('Not Found', { status: 404 })
        }

        const [routeKey, route] = matchingRoute

        // Track route matching success
        parentSpan.setAttributes({
          'route.found': true,
          'route.pattern': routeKey,
          'route.procedure': route.procedure,
          'route.matching_duration_ms': routeMatchingDuration,
        })

        logger.info(`[${requestId}] Route matched`, {
          service: 'api',
          apiEnvironment: req.unkey?.environment as ApiEnvironment,
          request_id: requestId,
          route_pattern: routeKey,
          procedure: route.procedure,
          matching_duration_ms: routeMatchingDuration,
        })

        // Extract parameters from URL with telemetry
        const paramExtractionStartTime = Date.now()
        const matches = path.match(route.pattern)?.slice(1) || []
        const paramCount = matches.length

        // Get body for POST/PUT requests with parsing telemetry
        let body = undefined
        let inputParsingDuration = 0

        if (req.method === 'POST' || req.method === 'PUT') {
          const bodyParsingStartTime = Date.now()
          try {
            body = await req.json()
            inputParsingDuration = Date.now() - bodyParsingStartTime

            parentSpan.setAttributes({
              'input.parsing_duration_ms': inputParsingDuration,
              'input.body_parsed': true,
            })
          } catch (error) {
            inputParsingDuration = Date.now() - bodyParsingStartTime
            parentSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: 'Invalid JSON in request body',
            })
            parentSpan.setAttributes({
              'error.type': 'VALIDATION_ERROR',
              'error.category': 'VALIDATION_ERROR',
              'error.message': 'Invalid JSON in request body',
              'http.status_code': 400,
              'input.parsing_duration_ms': inputParsingDuration,
              'input.body_parsed': false,
            })

            logger.error(
              `[${requestId}] Invalid JSON in request body`,
              {
                service: 'api',
                apiEnvironment: req.unkey
                  ?.environment as ApiEnvironment,
                request_id: requestId,
                error: error as Error,
                parsing_duration_ms: inputParsingDuration,
              }
            )

            return NextResponse.json(
              { error: 'Invalid JSON in request body' },
              { status: 400 }
            )
          }
        }

        // Map URL parameters and body to tRPC input
        const input = route.mapParams(matches, body)

        const paramExtractionDuration =
          Date.now() - paramExtractionStartTime

        parentSpan.setAttributes({
          'route.params_count': paramCount,
          'route.param_extraction_duration_ms':
            paramExtractionDuration,
        })
        // Create modified request with the correct tRPC procedure path
        const newUrl = new URL(req.url)
        newUrl.pathname = `/api/v1/trpc/${route.procedure}`

        if (req.method === 'GET') {
          const queryParamsObject = searchParamsToObject(
            new URL(req.url).searchParams
          )
          try {
            const parsedPaginationParams: PaginationParams = parsePaginationParams(queryParamsObject)
            if (parsedPaginationParams.cursor) {
              parseAndValidateCursor(parsedPaginationParams.cursor)
            }
            const mergedInput = { ...(input ?? {}), ...parsedPaginationParams }
            newUrl.searchParams.set(
              'input',
              JSON.stringify({ json: mergedInput })
            )
          } catch (error) {
            parentSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: 'Invalid pagination parameters',
            })
            parentSpan.setAttributes({
              'error.type': 'VALIDATION_ERROR',
              'error.category': 'VALIDATION_ERROR',
              'error.message': (error as Error).message,
              'http.status_code': 400,
            })

            logger.error(
              `[${requestId}] Invalid pagination parameters`,
              {
                service: 'api',
                apiEnvironment: req.unkey
                  ?.environment as ApiEnvironment,
                request_id: requestId,
                error: error as Error,
                queryParams: queryParamsObject,
              }
            )

            return NextResponse.json(
              { error: (error as Error).message },
              { status: 400 }
            )
          }
        }

        let newReq: Request

        /**
         * TRPC expects a POST requests for all mutations.
         * So even if we have a PUT in the OpenAPI spec, we need to convert it to a POST
         * when mapping to TRPC.
         */
        if (req.method === 'POST' || req.method === 'PUT') {
          newReq = new Request(newUrl, {
            headers: req.headers,
            method: 'POST',
            body: JSON.stringify({
              json: input,
            }),
          })
        } else {
          newReq = new Request(newUrl, {
            headers: req.headers,
            method: req.method,
          })
        }
        // Execute the TRPC handler within our trace context with telemetry
        const trpcStartTime = Date.now()
        const response = await context.with(ctx, () =>
          fetchRequestHandler({
            endpoint: '/api/v1/trpc',
            req: newReq,
            router: appRouter,
            createContext: createApiContext({
              organizationId,
              environment: req.unkey?.environment as ApiEnvironment,
            }) as unknown as FetchCreateContextFn<typeof appRouter>,
          })
        )
        const trpcDuration = Date.now() - trpcStartTime

        parentSpan.setAttributes({
          'trpc.execution_duration_ms': trpcDuration,
        })

        // Parse response and track telemetry
        const responseSerializationStartTime = Date.now()
        const responseJson: TRPCResponse = await response.json()
        const responseSerializationDuration =
          Date.now() - responseSerializationStartTime

        if (!responseJson.result) {
          const errorMessage = parseErrorMessage(
            responseJson.error.json.message
          )
          const errorCode = responseJson.error.json.data.code
          const httpStatus =
            responseJson.error.json.data.httpStatus || 400

          // Categorize the error
          let errorCategory = 'INTERNAL_ERROR'
          if (errorCode === 'UNAUTHORIZED') {
            errorCategory = 'AUTH_ERROR'
          } else if (errorCode === 'NOT_FOUND') {
            errorCategory = 'NOT_FOUND'
          } else if (
            errorCode === 'BAD_REQUEST' ||
            errorCode === 'PARSE_ERROR' ||
            errorCode === 'VALIDATION_ERROR'
          ) {
            errorCategory = 'VALIDATION_ERROR'
          }

          const totalDuration = Date.now() - requestStartTime

          parentSpan.setStatus({
            code: SpanStatusCode.ERROR,
            message: errorMessage as string,
          })
          parentSpan.setAttributes({
            'error.type': errorCode,
            'error.category': errorCategory,
            'error.message': errorMessage as string,
            'error.endpoint': route.procedure,
            'http.status_code': httpStatus,
            'perf.total_duration_ms': totalDuration,
            'perf.response_serialization_duration_ms':
              responseSerializationDuration,
          })

          logger.error(`[${requestId}] REST API Error`, {
            service: 'api',
            apiEnvironment: req.unkey?.environment as ApiEnvironment,
            request_id: requestId,
            method: req.method,
            path,
            procedure: route.procedure,
            error_message: JSON.stringify(errorMessage),
            error_code: errorCode,
            error_category: errorCategory,
            http_status: httpStatus,
            organization_id: organizationId,
            total_duration_ms: totalDuration,
            stack: responseJson.error.json.data.stack,
          })

          return NextResponse.json(
            {
              error: errorMessage,
              code: errorCode,
            },
            {
              status: httpStatus,
            }
          )
        }

        // Success response
        const responseData = responseJson.result.data.json
        const responseSize = JSON.stringify(responseData).length
        const totalDuration = Date.now() - requestStartTime

        parentSpan.setStatus({ code: SpanStatusCode.OK })
        parentSpan.setAttributes({
          'http.status_code': 200,
          'response.body_size_bytes': responseSize,
          'perf.total_duration_ms': totalDuration,
          'perf.route_matching_duration_ms': routeMatchingDuration,
          'perf.param_extraction_duration_ms':
            paramExtractionDuration,
          'perf.input_parsing_duration_ms': inputParsingDuration,
          'perf.trpc_execution_duration_ms': trpcDuration,
          'perf.response_serialization_duration_ms':
            responseSerializationDuration,
        })

        // Business metrics
        const endpointCategory = route.procedure.split('.')[0] // e.g., 'products', 'customers'
        const operationType =
          req.method === 'GET'
            ? 'read'
            : req.method === 'DELETE'
              ? 'delete'
              : 'write'

        parentSpan.setAttributes({
          'business.endpoint_category': endpointCategory,
          'business.operation_type': operationType,
          'business.feature_name': route.procedure,
        })

        logger.info(`[${requestId}] REST API Success`, {
          service: 'api',
          apiEnvironment: req.unkey?.environment as ApiEnvironment,
          request_id: requestId,
          method: req.method,
          path,
          procedure: route.procedure,
          organization_id: organizationId,
          environment: req.unkey?.environment,
          total_duration_ms: totalDuration,
          response_size_bytes: responseSize,
          endpoint_category: endpointCategory,
          operation_type: operationType,
          rest_sdk_version: sdkVersion,
        })

        return NextResponse.json(responseData)
      } catch (error) {
        // Catch any unexpected errors
        const totalDuration = Date.now() - requestStartTime

        parentSpan.recordException(error as Error)
        parentSpan.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        })
        parentSpan.setAttributes({
          'error.type': 'INTERNAL_ERROR',
          'error.category': 'INTERNAL_ERROR',
          'error.message': (error as Error).message,
          'http.status_code': 500,
          'perf.total_duration_ms': totalDuration,
        })

        logger.error(`[${requestId}] REST API Unexpected Error`, {
          service: 'api',
          apiEnvironment: req.unkey?.environment as ApiEnvironment,
          request_id: requestId,
          error: error as Error,
          method: req.method,
          url: req.url,
          total_duration_ms: totalDuration,
          rest_sdk_version: sdkVersion,
        })

        return NextResponse.json(
          { error: 'Internal server error' },
          { status: 500 }
        )
      } finally {
        parentSpan.end()
      }
    }
  )
}

const SDK_API_KEY_MESSAGE = `Please check that you are providing a valid API key. If requesting via SDK, ensure the FLOWGLAD_SECRET_KEY is set in your server's environment variables.`

const withVerification = (
  handler: (
    req: NextRequestWithUnkeyContext,
    context: FlowgladRESTRouteContext
  ) => Promise<Response>
): ((
  req: NextRequestWithUnkeyContext,
  context: FlowgladRESTRouteContext
) => Promise<Response>) => {
  return async (
    req: NextRequestWithUnkeyContext,
    context: FlowgladRESTRouteContext
  ) => {
    const tracer = trace.getTracer('rest-api-auth')

    return tracer.startActiveSpan(
      'API Key Verification',
      { kind: SpanKind.INTERNAL },
      async (authSpan) => {
        const authStartTime = Date.now()
        try {
          const headerSet = await headers()
          const authorizationHeader = headerSet.get('Authorization')

          if (!authorizationHeader) {
            authSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: 'Missing authorization header',
            })
            authSpan.setAttributes({
              'auth.error': 'missing_header',
              'auth.failure_reason': 'missing_authorization',
            })

            // Track security event
            trackSecurityEvent({
              type: 'failed_auth',
              details: { reason: 'missing_authorization_header' },
            })

            logger.warn(
              'REST API Auth Failed: Missing authorization header',
              {
                service: 'api',
                method: req.method,
                url: req.url,
              }
            )
            return new Response(
              'Unauthorized. Authorization header is required, and must include api key in format Authorization: "Bearer <key>", or Authorization: "<key>"',
              { status: 401 }
            )
          }

          const apiKey = getApiKeyHeader(authorizationHeader)
          if (!apiKey) {
            authSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: 'Invalid authorization format',
            })
            authSpan.setAttributes({
              'auth.error': 'invalid_format',
              'auth.failure_reason': 'malformed_header',
            })

            // Track security event
            trackSecurityEvent({
              type: 'failed_auth',
              details: { reason: 'malformed_authorization_header' },
            })

            logger.warn(
              'REST API Auth Failed: Invalid authorization format',
              {
                service: 'api',
                method: req.method,
                url: req.url,
              }
            )
            return new Response(
              'Either the API key was missing, or it was in an invalid format. Authorization header is required, and must include api key in format Authorization: "Bearer <key>", or Authorization: "<key>"',
              { status: 401 }
            )
          }

          // Track API key prefix for debugging (first 8 chars)
          const keyPrefix = apiKey.substring(0, 8)
          authSpan.setAttributes({
            'auth.key_prefix': keyPrefix,
          })

          // Verify API key with telemetry - single verification call
          const verificationStartTime = Date.now()
          const { result, error } = await verifyApiKey(apiKey)
          const verificationDuration =
            Date.now() - verificationStartTime

          authSpan.setAttributes({
            'auth.verification_duration_ms': verificationDuration,
          })

          if (error) {
            authSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: `API key verification error: ${error.message || error}`,
            })
            authSpan.setAttributes({
              'auth.error': 'verification_error',
              'auth.failure_reason': 'unkey_error',
              'auth.error_message': String(error),
            })

            logger.error('REST API Auth Error: Unkey error', {
              service: 'api',
              error,
              method: req.method,
              url: req.url,
              key_prefix: keyPrefix,
              verification_duration_ms: verificationDuration,
            })
            return new Response(
              'API key verification failed. ' + SDK_API_KEY_MESSAGE,
              { status: 401 }
            )
          }

          if (!result) {
            authSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message:
                'API key verification returned no result. ' +
                SDK_API_KEY_MESSAGE,
            })
            authSpan.setAttributes({
              'auth.error': 'verification_failed',
              'auth.failure_reason': 'no_result',
            })

            // Track failed auth and check for suspicious patterns
            const isSuspicious = trackFailedAuth(keyPrefix)
            authSpan.setAttributes({
              'security.suspicious_activity': isSuspicious,
            })

            trackSecurityEvent({
              type: 'failed_auth',
              apiKeyPrefix: keyPrefix,
              details: { reason: 'verification_failed' },
            })

            logger.warn('REST API Auth Failed: Verification failed', {
              service: 'api',
              method: req.method,
              url: req.url,
              key_prefix: keyPrefix,
              verification_duration_ms: verificationDuration,
              suspicious_activity: isSuspicious,
            })
            return new Response('Unauthorized', { status: 401 })
          }

          if (!result?.valid) {
            const failureReason =
              result.code === 'EXPIRED'
                ? 'expired'
                : result.code === 'RATE_LIMITED'
                  ? 'rate_limited'
                  : 'invalid'

            authSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: `API key invalid: ${failureReason}`,
            })
            authSpan.setAttributes({
              'auth.error': 'invalid_key',
              'auth.failure_reason': failureReason,
              'auth.error_code': result.code || 'UNKNOWN',
            })

            // Track security events
            if (failureReason === 'expired') {
              trackSecurityEvent({
                type: 'expired_key',
                apiKeyPrefix: keyPrefix,
                organizationId: result.ownerId,
                details: {
                  expired_at: result.expires
                    ? new Date(result.expires).toISOString()
                    : undefined,
                },
              })
            } else if (failureReason === 'rate_limited') {
              trackSecurityEvent({
                type: 'rate_limit',
                apiKeyPrefix: keyPrefix,
                organizationId: result.ownerId,
                details: {
                  remaining: result.remaining,
                  limit: result.ratelimit?.limit,
                },
              })
            } else {
              const isSuspicious = trackFailedAuth(keyPrefix)
              authSpan.setAttributes({
                'security.suspicious_activity': isSuspicious,
              })

              trackSecurityEvent({
                type: 'failed_auth',
                apiKeyPrefix: keyPrefix,
                details: {
                  reason: failureReason,
                  code: result.code,
                },
              })
            }

            logger.warn('REST API Auth Failed: Invalid key', {
              service: 'api',
              method: req.method,
              url: req.url,
              key_prefix: keyPrefix,
              failure_reason: failureReason,
              error_code: result.code,
              verification_duration_ms: verificationDuration,
            })
            return new Response(
              'API key invalid. ' + SDK_API_KEY_MESSAGE,
              { status: 401 }
            )
          }

          // Check if using expired key (shouldn't happen if valid=true, but double-check)
          if (result.expires) {
            checkForExpiredKeyUsage(result.expires)
          }

          // Success - add telemetry
          const authDuration = Date.now() - authStartTime
          authSpan.setStatus({ code: SpanStatusCode.OK })
          authSpan.setAttributes({
            'auth.success': true,
            'auth.duration_ms': authDuration,
            'auth.environment': result.environment || 'unknown',
            'auth.expires_at': result.expires
              ? new Date(result.expires).toISOString()
              : undefined,
            'auth.remaining_requests': result.remaining || undefined,
            'security.auth_attempts': 1,
            'security.failed_auth_count': 0,
          })

          // Set user context in Sentry for API key requests
          if (result.ownerId) {
            Sentry.setUser({
              id: result.ownerId,
            })
          } else {
            Sentry.setUser(null)
          }

          logger.info('REST API Auth Success', {
            service: 'api',
            apiEnvironment: result.environment as ApiEnvironment,
            method: req.method,
            url: req.url,
            key_prefix: keyPrefix,
            environment: result.environment,
            auth_duration_ms: authDuration,
            verification_duration_ms: verificationDuration,
          })

          const reqWithUnkey = Object.assign(req, {
            unkey: result,
          })

          return handler(reqWithUnkey, context)
        } finally {
          authSpan.end()
        }
      }
    )
  }
}

const handlerWrapper = core.IS_TEST
  ? innerHandler
  : withVerification(innerHandler)

const handler = handlerWrapper

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as DELETE,
}

// Example Usage:
// GET /api/v1/products - lists products
// POST /api/v1/products - creates product
// PUT /api/v1/products/123 - updates product 123
// GET /api/v1/payment-methods - lists payment methods
// GET /api/v1/payment-methods/123 - gets payment method 123
