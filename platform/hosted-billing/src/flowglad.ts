import { FlowgladServer } from '@flowglad/nextjs/server'
import {
  getUserBillingPortalCustomerExternalId,
  stackServerApp,
} from './stack'

export const flowgladServer = (params: {
  organizationId: string
  externalId: string
  billingPortalApiKey: string
}) => {
  return new FlowgladServer({
    getRequestingCustomer: async () => {
      const user = await stackServerApp(params).getUser()
      if (!user) {
        throw new Error('User not found')
      }
      return {
        email: user.primaryEmail!,
        name: user.displayName!,
        externalId: getUserBillingPortalCustomerExternalId({
          organizationId: params.organizationId,
          user,
        }),
      }
    },
    baseURL: process.env.API_BASE_URL,
    apiKey: params.billingPortalApiKey,
  })
}
