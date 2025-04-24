import * as jose from 'jose'
import { NextRequest } from 'next/server'
import { core } from './core'
import { headers } from 'next/headers'

export const validateBillingAuthentication = async (
  request: NextRequest
) => {
  // you need to install the jose library if it's not already installed

  // you can cache this and refresh it with a low frequency
  const jwks = jose.createRemoteJWKSet(
    new URL(
      `https://api.stack-auth.com/api/v1/projects/${core.envVariable('STACK_AUTH_HOSTED_BILLING_PROJECT_ID')}/.well-known/jwks.json`
    )
  )

  const accessToken = (await headers()).get('x-stack-access-token')
  if (!accessToken) {
    throw new Error('Missing or invalid authorization header')
  }
  try {
    const { payload } = await jose.jwtVerify(accessToken, jwks)
    console.log('Authenticated user with ID:', payload.sub)
    return true
  } catch (error) {
    console.error()
    console.log('validateBillingAuthentication: Invalid user', error)
    throw new Error('Invalid user')
  }
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
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      valid: false,
      error: 'Missing or invalid authorization header',
    }
  }
  const secretKey = authHeader.split(' ')[1] // Remove 'Bearer ' prefix

  if (
    secretKey !== core.envVariable('HOSTED_BILLING_API_SECRET_KEY')
  ) {
    return {
      valid: false,
      error: 'Invalid API key',
    }
  }

  if (additionalValidation?.authenticated) {
    const userAuthenticated =
      await validateBillingAuthentication(request)
    if (!userAuthenticated) {
      return {
        valid: false,
        error: 'User not found',
      }
    }
  }
  return {
    valid: true,
    livemode:
      core.envVariable('LIVEMODE_BILLING_HOSTED_API_KEY') ===
      secretKey,
  }
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
    const result = await validateBillingApiRequest(
      request,
      additionalValidation
    )
    if (!result.valid) {
      return new Response(result.error, { status: 401 })
    }
    request.livemode = result.livemode
    return handler(request)
  }
}
