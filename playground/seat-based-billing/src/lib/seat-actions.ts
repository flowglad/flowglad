'use server'

import { flowglad } from './flowglad'
import { auth } from './auth'
import { headers } from 'next/headers'

/**
 * Helper to get the current organization ID from the session.
 * The seat-based-billing playground uses organizations as customers.
 */
async function getCustomerExternalId(): Promise<string> {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session?.session?.activeOrganizationId) {
    throw new Error('No active organization')
  }
  return session.session.activeOrganizationId
}

/**
 * Claim a seat for a team member.
 *
 * Uses email as the externalId for the resource claim, allowing seats to be
 * claimed for users who haven't signed up yet (invitation flow).
 *
 * @param email - The email address of the team member to claim a seat for
 * @param metadata - Optional metadata to attach to the claim
 * @returns The created claim and updated usage
 */
export async function claimSeat(
  email: string,
  metadata?: Record<string, string | number | boolean>
) {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)
  return client.claimResource({
    resourceSlug: 'seats',
    externalId: email,
    metadata,
  })
}

/**
 * Release a seat that was previously claimed.
 *
 * @param email - The email address of the team member whose seat to release
 * @returns The released claim and updated usage
 */
export async function releaseSeat(email: string) {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)
  return client.releaseResource({
    resourceSlug: 'seats',
    externalId: email,
  })
}

/**
 * Get the current seat resource usage.
 *
 * Returns capacity, claimed count, and available count for the seats resource.
 *
 * @returns Resources with usage data
 */
export async function getSeats() {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)
  return client.getResources()
}

/**
 * List all active seat claims.
 *
 * Returns all claimed seats with their externalId (email) and metadata.
 *
 * @returns Array of active seat claims
 */
export async function listSeatClaims() {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)
  return client.listResourceClaims({ resourceSlug: 'seats' })
}

/**
 * Adjust the seat count on the subscription.
 *
 * Changes the subscription quantity, which affects the seat capacity.
 * Will fail if the new quantity is less than the current claimed count.
 *
 * @param newQuantity - The new number of seats for the subscription
 * @returns The adjusted subscription
 */
export async function adjustSeatCount(newQuantity: number) {
  const customerExternalId = await getCustomerExternalId()
  const client = flowglad(customerExternalId)

  return client.adjustSubscription({
    priceSlug: 'pro_monthly',
    quantity: newQuantity,
    timing: 'immediately',
  })
}
