import { ServerUser, StackServerApp } from '@stackframe/stack'
import { billingPortalMetadataSchema } from './apiSchemas'

export const stackServerApp = (organizationId: string) =>
  new StackServerApp({
    tokenStore: 'nextjs-cookie',
    urls: {
      afterSignIn: `/${organizationId}/manage`,
    },
  })

export const getUserBillingPortalApiKey = ({
  organizationId,
  user,
}: {
  organizationId: string
  user: ServerUser
}) => {
  const billingPortalMetadata = billingPortalMetadataSchema.parse(
    user.serverMetadata.billingPortalMetadata[organizationId]
  )
  return billingPortalMetadata.apiKey
}

export const getUserBillingPortalCustomerExternalId = ({
  organizationId,
  user,
}: {
  organizationId: string
  user: ServerUser
}) => {
  const billingPortalMetadata = billingPortalMetadataSchema.parse(
    user.serverMetadata.billingPortalMetadata[organizationId]
  )
  return billingPortalMetadata.customerExternalId
}
