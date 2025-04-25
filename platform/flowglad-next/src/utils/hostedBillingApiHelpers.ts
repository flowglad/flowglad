import * as jose from 'jose'
import { NextRequest } from 'next/server'
import { core } from './core'
import { headers } from 'next/headers'
import { logger } from '@/utils/logger'
import { trace, SpanStatusCode, context } from '@opentelemetry/api'

export const validateBillingAuthentication = async (
  request: NextRequest
) => {
  const tracer = trace.getTracer('billing-auth')
  return tracer.startActiveSpan(
    'validateBillingAuthentication',
    async (span) => {
      try {
        // you need to install the jose library if it's not already installed

        // you can cache this and refresh it with a low frequency
        const jwks = jose.createRemoteJWKSet(
          new URL(
            `https://api.stack-auth.com/api/v1/projects/${core.envVariable('STACK_AUTH_HOSTED_BILLING_PROJECT_ID')}/.well-known/jwks.json`
          )
        )

        const accessToken = (await headers()).get(
          'x-stack-access-token'
        )
        if (!accessToken) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Missing or invalid authorization header',
          })
          span.setAttributes({ 'error.type': 'AUTH_ERROR' })
          logger.error(
            'Billing authentication failed: Missing access token'
          )
          throw new Error('Missing or invalid authorization header')
        }

        try {
          const { payload } = await jose.jwtVerify(accessToken, jwks)
          span.setStatus({ code: SpanStatusCode.OK })
          logger.info('Billing authentication successful', {
            userId: payload.sub,
            path: request.nextUrl.pathname,
          })
          return true
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Invalid user',
          })
          span.setAttributes({
            'error.type': 'JWT_VERIFICATION_ERROR',
          })
          logger.error('Billing authentication failed: Invalid JWT', {
            error:
              error instanceof Error ? error.message : String(error),
            path: request.nextUrl.pathname,
          })
          throw new Error('Invalid user')
        }
      } finally {
        span.end()
      }
    }
  )
}

export const validateBillingApiRequest = async (
  request: NextRequest,
  additionalValidation?: {
    authenticated?: boolean
  }
): Promise<
  | {
      valid: true
      livemode: boolean
    }
  | {
      valid: false
      error: string
    }
> => {
  const tracer = trace.getTracer('billing-api')
  return tracer.startActiveSpan(
    'validateBillingApiRequest',
    async (span) => {
      try {
        span.setAttributes({
          'http.method': request.method,
          'http.path': request.nextUrl.pathname,
          'validation.authenticated':
            additionalValidation?.authenticated || false,
        })

        logger.info('Validating billing API request', {
          method: request.method,
          path: request.nextUrl.pathname,
          requiresAuth: additionalValidation?.authenticated || false,
        })

        const authHeader = request.headers.get('Authorization')
        if (!authHeader?.startsWith('Bearer ')) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Missing or invalid authorization header',
          })
          span.setAttributes({ 'error.type': 'AUTH_ERROR' })
          logger.error(
            'Billing API validation failed: Missing or invalid authorization header',
            {
              path: request.nextUrl.pathname,
            }
          )
          return {
            valid: false as const,
            error: 'Missing or invalid authorization header',
          }
        }
        const secretKey = authHeader.split(' ')[1] // Remove 'Bearer ' prefix

        if (
          secretKey !==
            core.envVariable('HOSTED_BILLING_LIVEMODE_SECRET_KEY') &&
          secretKey !==
            core.envVariable('HOSTED_BILLING_TESTMODE_SECRET_KEY')
        ) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: 'Invalid API key',
          })
          span.setAttributes({ 'error.type': 'INVALID_API_KEY' })
          logger.error(
            'Billing API validation failed: Invalid API key',
            {
              path: request.nextUrl.pathname,
            }
          )
          return {
            valid: false as const,
            error: 'Invalid API key',
          }
        }

        if (additionalValidation?.authenticated) {
          try {
            const userAuthenticated =
              await validateBillingAuthentication(request)
            if (!userAuthenticated) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: 'User not found',
              })
              span.setAttributes({ 'error.type': 'USER_NOT_FOUND' })
              logger.error(
                'Billing API validation failed: User not found',
                {
                  path: request.nextUrl.pathname,
                }
              )
              return {
                valid: false as const,
                error: 'User not found',
              }
            }
          } catch (error) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message:
                error instanceof Error
                  ? error.message
                  : 'Authentication error',
            })
            span.setAttributes({
              'error.type': 'AUTHENTICATION_ERROR',
            })
            logger.error(
              'Billing API validation failed: Authentication error',
              {
                error:
                  error instanceof Error
                    ? error.message
                    : String(error),
                path: request.nextUrl.pathname,
              }
            )
            return {
              valid: false as const,
              error:
                error instanceof Error
                  ? error.message
                  : 'Authentication error',
            }
          }
        }

        const livemode =
          core.envVariable('HOSTED_BILLING_LIVEMODE_SECRET_KEY') ===
          secretKey
        span.setStatus({ code: SpanStatusCode.OK })
        span.setAttributes({ 'billing.livemode': livemode })

        logger.info('Billing API validation successful', {
          path: request.nextUrl.pathname,
          livemode,
        })

        return {
          valid: true as const,
          livemode,
        }
      } finally {
        span.end()
      }
    }
  )
}

export type NextRequestWithBillingApiRequestValidation =
  NextRequest & {
    livemode: boolean
  }

export const withBillingApiRequestValidation = (
  handler: (
    request: NextRequestWithBillingApiRequestValidation
  ) => Promise<Response>,
  additionalValidation?: {
    authenticated?: boolean
  }
) => {
  return async (
    request: NextRequestWithBillingApiRequestValidation
  ) => {
    const tracer = trace.getTracer('billing-api-handler')
    return tracer.startActiveSpan(
      'withBillingApiRequestValidation',
      async (span) => {
        try {
          span.setAttributes({
            'http.method': request.method,
            'http.path': request.nextUrl.pathname,
            'validation.authenticated':
              additionalValidation?.authenticated || false,
          })

          logger.info('Processing billing API request', {
            method: request.method,
            path: request.nextUrl.pathname,
            requiresAuth:
              additionalValidation?.authenticated || false,
          })

          const result = await validateBillingApiRequest(
            request,
            additionalValidation
          )
          if (!result.valid) {
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: result.error,
            })
            span.setAttributes({ 'error.type': 'VALIDATION_ERROR' })
            logger.error('Billing API request validation failed', {
              error: result.error,
              path: request.nextUrl.pathname,
            })
            return new Response(result.error, { status: 401 })
          }
          request.livemode = result.livemode

          logger.info(
            'Billing API request validation successful, proceeding to handler',
            {
              path: request.nextUrl.pathname,
              livemode: result.livemode,
            }
          )

          return handler(request)
        } finally {
          span.end()
        }
      }
    )
  }
}
