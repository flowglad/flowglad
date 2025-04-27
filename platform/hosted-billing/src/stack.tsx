import { ServerUser, StackServerApp } from '@stackframe/stack'
import { billingPortalMetadataSchema } from './apiSchemas'

export const globalStackServerApp = new StackServerApp({
  tokenStore: 'nextjs-cookie',
})

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
