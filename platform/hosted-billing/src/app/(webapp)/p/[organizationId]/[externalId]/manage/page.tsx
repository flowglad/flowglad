import { flowgladServer } from '@/flowglad'
import { validateCurrentUserBillingPortalApiKeyForOrganization } from '@/utils/flowgladHostedBillingApi'
import { getUserBillingPortalApiKey, stackServerApp } from '@/stack'
import { redirect } from 'next/navigation'
import { BillingPage } from './BillingPage'
import { logger } from '@/utils/logger'
import { portalRoute } from '@/utils/core'

interface BillingPortalManagePageProps {
  params: Promise<{
    organizationId: string
    externalId: string
  }>
  searchParams: Promise<{
    testmode?: boolean
  }>
}

export default async function BillingPortalManagePage({
  params,
  searchParams,
}: BillingPortalManagePageProps) {
  const { organizationId, externalId } = await params
  const { testmode } = await searchParams
  const livemode = typeof testmode === 'boolean' ? !testmode : true

  logger.info('Loading billing portal manage page', {
    organizationId,
    externalId,
    livemode,
  })

  const user = await stackServerApp({
    organizationId,
    externalId,
  }).getUser()
  if (!user) {
    logger.warn('User not found, redirecting to sign in', {
      organizationId,
      externalId,
    })
    return redirect(
      portalRoute({
        organizationId,
        customerExternalId: externalId,
        page: 'sign-in',
      })
    )
  }

  logger.info('User authenticated successfully', {
    organizationId,
    externalId,
    userId: user.id,
  })

  try {
    await validateCurrentUserBillingPortalApiKeyForOrganization({
      organizationId,
      externalId,
      livemode,
    })
    logger.info('Billing portal API key validated successfully', {
      organizationId,
      externalId,
    })
  } catch (error) {
    logger.error('Failed to validate billing portal API key', {
      organizationId,
      externalId,
      error,
    })
    return redirect(
      portalRoute({
        organizationId,
        customerExternalId: externalId,
        page: 'sign-in',
      })
    )
  }
  const mostUpToDateUser = await stackServerApp({
    organizationId,
    externalId,
  }).getUser()
  const billingPortalApiKey = getUserBillingPortalApiKey({
    organizationId,
    user: mostUpToDateUser!,
  })
  if (!billingPortalApiKey) {
    logger.warn(
      'Billing portal API key not found, redirecting to sign in',
      { organizationId, externalId }
    )
    return redirect(
      portalRoute({
        organizationId,
        customerExternalId: externalId,
        page: 'sign-in',
      })
    )
  }

  const { customer } = await flowgladServer({
    organizationId,
    externalId,
    billingPortalApiKey,
  }).getCustomer()
  if (!customer) {
    logger.warn('Customer not found, redirecting to sign in', {
      organizationId,
      externalId,
    })
    return redirect(
      portalRoute({
        organizationId,
        customerExternalId: externalId,
        page: 'sign-in',
      })
    )
  }

  logger.info('Billing portal page loaded successfully', {
    organizationId,
    externalId,
    customerId: customer.id,
  })

  return (
    <BillingPage
      organizationId={organizationId}
      externalId={externalId}
    />
  )
}
