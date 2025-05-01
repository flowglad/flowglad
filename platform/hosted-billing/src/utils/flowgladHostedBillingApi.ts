import axios, { AxiosError } from 'axios'
import { RequestMagicLinkBody } from './apiSchemas'
import { stackServerApp } from '../stack'
import { logger } from './logger'

const hostedBillingApiPost = async ({
  subPath,
  data,
  livemode,
  organizationId,
  externalId,
}: {
  subPath: string
  data: Record<string, unknown>
  livemode: boolean
  organizationId: string
  externalId: string
}) => {
  logger.debug('Making hosted billing API request', {
    subPath,
    data,
    livemode,
    organizationId,
    externalId,
  })

  const user = await stackServerApp({
    organizationId,
    externalId,
  }).getUser()
  const authHeaders = await user?.getAuthHeaders()

  try {
    logger.debug('Making request to hosted billing API', {
      url: `${process.env.API_BASE_URL}/api/hosted-billing/${subPath}`,
    })

    /**
     * Allow staging environment to access Flowglad Next Staging server
     */
    const maybeVercelBypass =
      process.env.VERCEL_ENV !== 'production'
        ? {
            'x-vercel-protection-bypass':
              process.env.VERCEL_PREVIEW_BYPASS_SECRET,
          }
        : {}
    const requestHeaders = {
      headers: {
        Authorization: `Bearer ${
          livemode
            ? process.env.HOSTED_BILLING_LIVEMODE_SECRET_KEY
            : process.env.HOSTED_BILLING_TESTMODE_SECRET_KEY
        }`,
        ...authHeaders,
        ...maybeVercelBypass,
      },
    }

    const response = await axios.post(
      `${process.env.API_BASE_URL}/api/hosted-billing/${subPath}`,
      data,
      requestHeaders
    )
    return response.data
  } catch (error: unknown) {
    const axiosError = error as AxiosError
    logger.error('Axios request failed', {
      error: error instanceof Error ? error.message : String(error),
      response: axiosError.response?.data,
      status: axiosError.response?.status,
      headers: axiosError.response?.headers,
      config: axiosError.config,
    })
    throw error
  }
}
/**
 * Calls the Flowglad hosted billing API to verify that the current user has a valid billing portal API key for the given organization.
 * The hosted billing API will get this from the user's server metadata. If the API key is present and valid,
 * it will succeed with 200.
 * If not, the hosted billing API will create a new API key and save it to the user's server metadata and return 200.
 * @param params
 * @returns
 */
export const validateCurrentUserBillingPortalApiKeyForOrganization =
  async (params: {
    organizationId: string
    externalId: string
    livemode: boolean
  }) => {
    return await hostedBillingApiPost({
      subPath: 'verify-billing-portal-api-key',
      data: {
        organizationId: params.organizationId,
      },
      livemode: params.livemode,
      organizationId: params.organizationId,
      externalId: params.externalId,
    })
  }

export const requestMagicLink = async (
  params: RequestMagicLinkBody & {
    livemode: boolean
  }
) => {
  return await hostedBillingApiPost({
    subPath: 'request-magic-link',
    data: params,
    livemode: params.livemode,
    organizationId: params.organizationId,
    externalId: params.customerExternalId,
  })
}
