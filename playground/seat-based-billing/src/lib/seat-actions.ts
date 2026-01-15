'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { flowglad } from '@/lib/flowglad'

// Helper to get current organization ID
async function getCustomerExternalId(): Promise<string> {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session?.session?.activeOrganizationId) {
    throw new Error('No active organization')
  }
  return session.session.activeOrganizationId
}

export async function claimSeat(
  email: string,
  metadata?: Record<string, unknown>
) {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)
  return client.claimResource({
    resourceSlug: 'seats',
    externalId: email,
    metadata,
  })
}

export async function releaseSeat(email: string) {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)
  return client.releaseResource({
    resourceSlug: 'seats',
    externalId: email,
  })
}

export async function getSeats() {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)
  return client.getResources()
}

export async function listSeatClaims() {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)
  return client.listResourceClaims({ resourceSlug: 'seats' })
}

export async function adjustSeatCount(newQuantity: number) {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)

  // Get current subscription to find the price
  const billing = await client.getBilling()
  const currentSub = billing.currentSubscriptions?.[0]
  if (!currentSub) {
    throw new Error('No active subscription')
  }

  return client.adjustSubscription({
    subscriptionId: currentSub.id,
    timing: 'immediately',
    subscriptionItems: [
      {
        priceSlug: 'pro_monthly',
        quantity: newQuantity,
      },
    ],
  })
}
