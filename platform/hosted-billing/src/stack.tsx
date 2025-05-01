import { ServerUser, StackServerApp } from '@stackframe/stack'
import { billingPortalMetadataSchema } from './utils/apiSchemas'
import { portalRoute } from './utils/core'

export const globalStackServerApp = new StackServerApp({
  tokenStore: 'nextjs-cookie',
})

export const stackServerApp = (params: {
  organizationId: string
  externalId: string
}) => {
  const afterSignIn = portalRoute({
    organizationId: params.organizationId,
    customerExternalId: params.externalId,
    page: 'manage',
  })
  console.log('afterSignIn', {
    afterSignIn,
  })
  return new StackServerApp({
    tokenStore: 'nextjs-cookie',
    urls: {
      afterSignIn,
    },
  })
}

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
