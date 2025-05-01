import axios from 'axios'
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
  const user = await stackServerApp(organizationId).getUser()
  const authHeaders = await user?.getAuthHeaders()
  console.log('process.env.API_BASE_URL', process.env.API_BASE_URL)
  const response = await axios.post(
    `${process.env.API_BASE_URL}/api/hosted-billing/${subPath}`,
    data,
    {
      headers: {
        Authorization: `Bearer ${
          livemode
            ? process.env.HOSTED_BILLING_LIVEMODE_SECRET_KEY
            : process.env.HOSTED_BILLING_TESTMODE_SECRET_KEY
        }`,
        ...authHeaders,
      },
    }
  )
  return response.data
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
