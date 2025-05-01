import axios, { AxiosError } from 'axios'
import { RequestMagicLinkBody } from './apiSchemas'
import { stackServerApp } from './stack'

const hostedBillingApiPost = async ({
  subPath,
  data,
  livemode,
  organizationId,
}: {
  subPath: string
  data: Record<string, unknown>
  livemode: boolean
  organizationId: string
}) => {
  console.log('process.env.API_BASE_URL', process.env.API_BASE_URL)
  console.log('subPath', subPath)
  console.log('data', data)
  console.log('livemode', livemode)
  console.log('organizationId', organizationId)
  console.log(
    'process.env.HOSTED_BILLING_LIVEMODE_SECRET_KEY',
    process.env.HOSTED_BILLING_LIVEMODE_SECRET_KEY
  )
  console.log(
    'process.env.HOSTED_BILLING_TESTMODE_SECRET_KEY',
    process.env.HOSTED_BILLING_TESTMODE_SECRET_KEY
  )
  const user = await stackServerApp(organizationId).getUser()
  const authHeaders = await user?.getAuthHeaders()
  console.log('authHeaders', authHeaders)
  try {
    console.log(
      'Making request to:',
      `${process.env.API_BASE_URL}/api/hosted-billing/${subPath}`
    )
    /**
     * Allow staging environment to access Flowglad Next Staging server
     */
    const maybeVercelBypass =
      process.env.VERCEL_ENV === 'preview'
        ? {
            'x-vercel-bypass':
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
    console.log('Request headers:', requestHeaders)
    const response = await axios.post(
      `${process.env.API_BASE_URL}/api/hosted-billing/${subPath}`,
      data,
      requestHeaders
    )
    return response.data
  } catch (error: unknown) {
    const axiosError = error as AxiosError
    console.error('Axios request failed:', {
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
  async (params: { organizationId: string }) => {
    return await hostedBillingApiPost({
      subPath: 'verify-billing-portal-api-key',
      data: {
        organizationId: params.organizationId,
      },
      livemode: false,
      organizationId: params.organizationId,
    })
  }

export const requestMagicLink = async (
  params: RequestMagicLinkBody
) => {
  return await hostedBillingApiPost({
    subPath: 'request-magic-link',
    data: params,
    livemode: false,
    organizationId: params.organizationId,
  })
}
