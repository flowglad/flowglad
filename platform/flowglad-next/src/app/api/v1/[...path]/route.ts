import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api'
import * as Sentry from '@sentry/nextjs'
import {
  type FetchCreateContextFn,
  fetchRequestHandler,
} from '@trpc/server/adapters/fetch'
import type { NextRequestWithUnkeyContext } from '@unkey/nextjs'
import { headers } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'
import { routes } from '@/app/api/v1/[...path]/restRoutes'
import { appRouter } from '@/server'
import { createApiContext } from '@/server/trpcContext'
import { type ApiEnvironment, FlowgladApiKeyType } from '@/types'
import { getApiKeyHeader } from '@/utils/apiKeyHelpers'
import core from '@/utils/core'
import { logger } from '@/utils/logger'
import {
  type PaginationParams,
  parseAndValidateCursor,
  parseAndValidateLegacyCursor,
  parsePaginationParams,
} from '@/utils/pagination'
import {
  checkForExpiredKeyUsage,
  trackFailedAuth,
  trackSecurityEvent,
} from '@/utils/securityTelemetry'
import { parseUnkeyMeta, verifyApiKey } from '@/utils/unkey'
import { searchParamsToObject } from '@/utils/url'
import { shouldAllowEmptyBody } from '@/utils/validateRequest'

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

// NOTE: consolidated REST route mapping lives in `restRoutes.ts` so it can be unit-tested
// without importing Next.js route handler modules.

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
        // Note: req.unkey has additional properties (ownerId, environment) added by verifyApiKey
        // that aren't in the V2KeysVerifyKeyResponseBody type, so we extract them safely
        const unkeyMeta = parseUnkeyMeta(req.unkey?.meta)
        const unkeyWithExtras = req.unkey as typeof req.unkey & {
          ownerId?: string
          environment?: string
        }
        const organizationId =
          unkeyMeta.organizationId || unkeyWithExtras.ownerId!
        const apiEnvironment =
          unkeyWithExtras.environment || 'unknown'
        const organizationIdSource = unkeyMeta.organizationId
          ? 'metadata'
          : 'owner_id'
        const userId =
          unkeyMeta.type === FlowgladApiKeyType.Secret
            ? unkeyMeta.userId
            : undefined
        const apiKeyType = unkeyMeta.type || 'unknown'
        // Extract pricingModelId from API key metadata for PM-scoped access
        const pricingModelId =
          unkeyMeta.type === FlowgladApiKeyType.Secret
            ? unkeyMeta.pricingModelId
            : undefined

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
          'api.environment': apiEnvironment,
          'api.key_type': apiKeyType,
          'api.pricing_model_id': pricingModelId,
          rest_sdk_version: sdkVersion,
        })

        logger.info(`[${requestId}] REST API Request Started`, {
          service: 'api',
          apiEnvironment: apiEnvironment as ApiEnvironment,
          request_id: requestId,
          method: req.method,
          path,
          organization_id: organizationId,
          organization_id_source: organizationIdSource,
          user_id: userId,
          environment: apiEnvironment,
          api_key_type: apiKeyType,
          pricing_model_id: pricingModelId,
          body_size_bytes: requestBodySize,
          rest_sdk_version: sdkVersion,
          span: parentSpan, // Pass span explicitly for trace correlation
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
            apiEnvironment: apiEnvironment as ApiEnvironment,
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
          apiEnvironment: apiEnvironment as ApiEnvironment,
          request_id: requestId,
          route_pattern: routeKey,
          procedure: route.procedure,
          matching_duration_ms: routeMatchingDuration,
          span: parentSpan, // Pass span explicitly for trace correlation
        })

        // Extract parameters from URL with telemetry
        const paramExtractionStartTime = Date.now()
        const matches = path.match(route.pattern)?.slice(1) || []
        const paramCount = matches.length

        // Get body for POST/PUT requests with parsing telemetry
        let body
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
            const path = (await params).path.join('/')
            const contentLength = req.headers.get('content-length')

            if (shouldAllowEmptyBody(path, contentLength)) {
              // Allow empty body for these specific routes
              body = {}

              parentSpan.setAttributes({
                'input.parsing_duration_ms': inputParsingDuration,
                'input.body_parsed': false,
                'input.body_empty': true,
                'input.empty_body_allowed': true,
              })
            } else {
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
                  apiEnvironment: apiEnvironment as ApiEnvironment,
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

        /**
         * Pagination query parsing and validation (GET only)
         *
         * Single-value semantics:
         * - Reject duplicate values for pagination params (`limit`, `cursor`) via `singleOrError`
         *   to avoid ambiguity and request smuggling.
         *
         * Cursor format and validation:
         * - `cursor` is an opaque base64-encoded JSON string.
         * - Primary path: `parseAndValidateCursor` requires `id` (optional `createdAt`, `direction`)
         *   to ensure stable keyset pagination with a `(createdAt, id)` tie-breaker.
         * - Legacy path (currently tolerated): if validation fails but the decoded payload lacks
         *   `id`, we accept it as a legacy cursor, set `pagination.legacy_cursor=true`, and log a
         *   deprecation warning. The DB layer then applies a createdAt-only boundary fallback.
         *
         * Telemetry and behavior:
         * - On success, parsed pagination params are merged into the tRPC input (via `input=json`)
         *   and traced as part of the request execution.
         * - On validation failure (non-legacy), we emit structured telemetry with the
         *   `VALIDATION_ERROR` category and return a 400 JSON error response.
         */
        if (req.method === 'GET') {
          const queryParamsObject = searchParamsToObject(
            new URL(req.url).searchParams
          )
          try {
            const parsedPaginationParams: PaginationParams =
              parsePaginationParams(queryParamsObject)
            if (parsedPaginationParams.cursor) {
              try {
                parseAndValidateCursor(parsedPaginationParams.cursor)
              } catch (e) {
                // Legacy cursor path: explicit validation without `id`
                try {
                  parseAndValidateLegacyCursor(
                    parsedPaginationParams.cursor
                  )
                  parentSpan.setAttributes({
                    'pagination.legacy_cursor': true,
                  })
                  logger.warn(
                    `[${requestId}] Accepting legacy cursor without id`,
                    {
                      service: 'api',
                      request_id: requestId,
                      route_pattern: routeKey,
                    }
                  )
                  // Proceed: DB layer applies createdAt-only boundary fallback
                } catch (_inner) {
                  // Not a valid legacy cursor; rethrow original error
                  throw e
                }
              }
            }
            // Merge all query params and validated pagination params into mapped route input
            // This allows routes to receive arbitrary query params (e.g., resourceSlug, resourceId)
            const mergedInput = {
              ...(input ?? {}),
              ...queryParamsObject,
              ...parsedPaginationParams,
            }
            newUrl.searchParams.set(
              'input',
              JSON.stringify({ json: mergedInput })
            )
          } catch (error) {
            // Emit validation telemetry and surface a 400 with a clear message
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
                apiEnvironment: apiEnvironment as ApiEnvironment,
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
              environment: apiEnvironment as ApiEnvironment,
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
            apiEnvironment: apiEnvironment as ApiEnvironment,
            request_id: requestId,
            method: req.method,
            path,
            procedure: route.procedure,
            error_message: JSON.stringify(errorMessage),
            error_code: errorCode,
            error_category: errorCategory,
            http_status: httpStatus,
            organization_id: organizationId,
            pricing_model_id: pricingModelId,
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
          apiEnvironment: apiEnvironment as ApiEnvironment,
          request_id: requestId,
          method: req.method,
          path,
          procedure: route.procedure,
          organization_id: organizationId,
          pricing_model_id: pricingModelId,
          environment: apiEnvironment,
          total_duration_ms: totalDuration,
          response_size_bytes: responseSize,
          endpoint_category: endpointCategory,
          operation_type: operationType,
          rest_sdk_version: sdkVersion,
          span: parentSpan, // Pass span explicitly for trace correlation
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

        const errorApiEnvironment = req.unkey
          ? (req.unkey as typeof req.unkey & { environment?: string })
              .environment || 'unknown'
          : 'unknown'
        logger.error(`[${requestId}] REST API Unexpected Error`, {
          service: 'api',
          apiEnvironment: errorApiEnvironment as ApiEnvironment,
          request_id: requestId,
          error: error as Error,
          method: req.method,
          url: req.url,
          total_duration_ms: totalDuration,
          rest_sdk_version: sdkVersion,
          span: parentSpan, // Pass span explicitly for trace correlation
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
            const errorMessage =
              error instanceof Error ? error.message : String(error)
            authSpan.setStatus({
              code: SpanStatusCode.ERROR,
              message: `API key verification error: ${errorMessage}`,
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
                  remaining: result.ratelimits?.[0]?.remaining,
                  limit: result.ratelimits?.[0]?.limit,
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
            'auth.remaining_requests': result.credits || undefined,
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

const routeHandler = async (
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> => {
  const handler = core.IS_TEST
    ? innerHandler
    : withVerification(innerHandler)
  return handler(
    request as NextRequestWithUnkeyContext,
    context as FlowgladRESTRouteContext
  )
}

export const GET = routeHandler
export const POST = routeHandler
export const PUT = routeHandler
export const DELETE = routeHandler

// Example Usage:
// GET /api/v1/products - lists products
// POST /api/v1/products - creates product
// PUT /api/v1/products/123 - updates product 123
// GET /api/v1/payment-methods - lists payment methods
// GET /api/v1/payment-methods/123 - gets payment method 123
