import * as R from 'ramda'
import * as jose from 'jose'
import { NextRequest } from 'next/server'
import { core } from './core'
import { headers } from 'next/headers'
import { logger } from '@/utils/logger'
import { trace, SpanStatusCode, context } from '@opentelemetry/api'
import { ServerUser, User } from '@stackframe/stack'
import { z } from 'zod'
import { ConsoleLogWriter } from 'drizzle-orm'
export const validateBillingAuthentication = async (
  request: NextRequest
) => {
  const tracer = trace.getTracer('billing-auth')
  return tracer.startActiveSpan(
    'validateBillingAuthentication',
    async (span) => {
      try {
        // you need to install the jose library if it's not already installed
        const hostedBillingJWTURL = `https://api.stack-auth.com/api/v1/projects/${core.envVariable('NEXT_PUBLIC_STACK_HOSTED_BILLING_PROJECT_ID')}/.well-known/jwks.json`
        // you can cache this and refresh it with a low frequency
        const jwks = jose.createRemoteJWKSet(
          new URL(hostedBillingJWTURL)
        )

        const accessToken = JSON.parse(
          (await headers()).get('x-stack-auth') ?? '{}'
        ).accessToken
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
          return payload
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
      authData?: jose.JWTPayload
    }
  | {
      valid: false
      error: string
      authData: null
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
            authData: null,
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
            authData: null,
          }
        }
        let authData: jose.JWTPayload | undefined
        if (additionalValidation?.authenticated) {
          try {
            authData = await validateBillingAuthentication(request)
            if (!authData) {
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
                authData: null,
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
              authData: null,
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
          authData,
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
    authData?: jose.JWTPayload
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
          request.authData = result.authData
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

const billingPortalMetadataSchema = z.object({
  apiKey: z.string().optional(),
  customerExternalId: z.string().optional(),
})

export const getHostedBillingMetadataFromStackAuthUser = (params: {
  stackAuthUser: Pick<ServerUser, 'serverMetadata'>
  organizationId: string
}) => {
  const { stackAuthUser, organizationId } = params
  return billingPortalMetadataSchema.parse(
    stackAuthUser.serverMetadata.billingPortalMetadata[
      organizationId
    ] ?? {}
  )
}

export const clearHostedBillingApiKeyFromStackAuthUser =
  async (params: {
    stackAuthUser: ServerUser
    organizationId: string
  }) => {
    const { stackAuthUser, organizationId } = params
    await stackAuthUser.update({
      serverMetadata: setApiKeyOnServerMetadata({
        existingServerMetadata: stackAuthUser.serverMetadata,
        organizationId,
        apiKey: undefined,
      }),
    })
  }

export const setApiKeyOnServerMetadata = ({
  existingServerMetadata,
  organizationId,
  apiKey,
}: {
  existingServerMetadata: Record<string, any>
  organizationId: string
  apiKey?: string
}) => {
  return R.assocPath(
    ['billingPortalMetadata', organizationId, 'apiKey'],
    apiKey,
    existingServerMetadata
  )
}

/**
 * Sets the customerExternalId on the serverMetadata for the given organizationId
 * If the customerExternalId is already set and changes for the given organizationId,
 * we erase the apiKey for the given organizationId, as a hammer to prevent
 * using another customer's api key.
 * @param params - The parameters object containing existingServerMetadata, organizationId, and customerExternalId
 * @returns The updated serverMetadata with the customerExternalId set
 */
export const setCustomerExternalIdOnServerMetadata = ({
  existingServerMetadata,
  organizationId,
  customerExternalId,
}: {
  existingServerMetadata: Record<string, any>
  organizationId: string
  customerExternalId?: string
}) => {
  const existingCustomerExternalId = R.pathOr(
    undefined,
    ['billingPortalMetadata', organizationId, 'customerExternalId'],
    existingServerMetadata
  )
  /**
   * If the customerExternalId is already set and is not changing,
   * return the existing serverMetadata.
   */
  if (
    existingCustomerExternalId === customerExternalId &&
    customerExternalId
  ) {
    return existingServerMetadata
  }
  /**
   * Otherwise, set the customerExternalId on the serverMetadata for the given organizationId
   * and erase the apiKey for the given organizationId, as a hammer to prevent
   * using another customer's api key.
   */
  const metadataWithNewCustomerId = R.assocPath(
    ['billingPortalMetadata', organizationId, 'customerExternalId'],
    customerExternalId,
    existingServerMetadata
  )
  const metadataWithoutApiKey = R.assocPath(
    ['billingPortalMetadata', organizationId, 'apiKey'],
    undefined,
    metadataWithNewCustomerId
  )
  return metadataWithoutApiKey
}

export const setHostedBillingApiKeyForStackAuthUser = async (params: {
  stackAuthUser: ServerUser
  organizationId: string
  apiKey: string
}) => {
  const { stackAuthUser, organizationId, apiKey } = params
  await stackAuthUser.update({
    serverMetadata: setApiKeyOnServerMetadata({
      existingServerMetadata: stackAuthUser.serverMetadata,
      organizationId,
      apiKey,
    }),
  })
}

export const setHostedBillingCustomerExternalIdForStackAuthUser =
  async (params: {
    stackAuthUser: ServerUser
    organizationId: string
    customerExternalId: string
  }) => {
    const { stackAuthUser, organizationId, customerExternalId } =
      params
    await stackAuthUser.update({
      serverMetadata: setCustomerExternalIdOnServerMetadata({
        existingServerMetadata: stackAuthUser.serverMetadata,
        organizationId,
        customerExternalId,
      }),
    })
  }

export const getHostedBillingCustomerExternalIdForStackAuthUser =
  async (params: {
    stackAuthUser: ServerUser
    organizationId: string
  }) => {
    const { stackAuthUser, organizationId } = params
    const billingPortalMetadata =
      await getHostedBillingMetadataFromStackAuthUser({
        stackAuthUser,
        organizationId,
      })
    return billingPortalMetadata.customerExternalId
  }

export const clearHostedBillingCustomerExternalIdForStackAuthUser =
  async (params: {
    stackAuthUser: ServerUser
    organizationId: string
  }) => {
    const { stackAuthUser, organizationId } = params
    await stackAuthUser.update({
      serverMetadata: setCustomerExternalIdOnServerMetadata({
        existingServerMetadata: stackAuthUser.serverMetadata,
        organizationId,
        customerExternalId: undefined,
      }),
    })
  }
