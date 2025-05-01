import { ServerUser, StackServerApp } from '@stackframe/stack'
import { billingPortalMetadataSchema } from './utils/apiSchemas'

export const globalStackServerApp = new StackServerApp({
  tokenStore: 'nextjs-cookie',
})

export const stackServerApp = (params: {
  organizationId: string
  externalId: string
}) =>
  new StackServerApp({
    tokenStore: 'nextjs-cookie',
    urls: {
      afterSignIn: `/p/${params.organizationId}/${params.externalId}/manage`,
    },
  })

export const getUserBillingPortalApiKey = ({
  organizationId,
  user,
}: {
  organizationId: string
  user: ServerUser
}): string | null => {
  const rawMetadata =
    user.serverMetadata.billingPortalMetadata[organizationId]
  const billingPortalMetadata =
    billingPortalMetadataSchema.safeParse(rawMetadata)
  if (!billingPortalMetadata.success) {
    console.log(
      'billingPortalMetadata.error',
      billingPortalMetadata.error
    )
    return null
  }
  return billingPortalMetadata.data.apiKey
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
