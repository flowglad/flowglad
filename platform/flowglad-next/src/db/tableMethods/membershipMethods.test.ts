import { beforeEach, describe, expect, it } from 'vitest'
import { setupMemberships, setupOrg } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { Membership } from '@/db/schema/memberships'
import {
  getMembershipNotificationPreferences,
  selectMemberships,
  updateMembership,
} from './membershipMethods'

describe('getMembershipNotificationPreferences', () => {
  let organizationId: string
  let membership: Membership.Record

  beforeEach(async () => {
    const { organization } = await setupOrg()
    organizationId = organization.id
    membership = await setupMemberships({ organizationId })
  })

  it('returns all defaults when membership has empty preferences', async () => {
    const prefs = getMembershipNotificationPreferences(membership)

    // Test mode defaults to false
    expect(prefs.testModeNotifications).toBe(false)

    // All 7 notification type preferences default to true
    expect(prefs.subscriptionCreated).toBe(true)
    expect(prefs.subscriptionAdjusted).toBe(true)
    expect(prefs.subscriptionCanceled).toBe(true)
    expect(prefs.subscriptionCancellationScheduled).toBe(true)
    expect(prefs.paymentFailed).toBe(true)
    expect(prefs.onboardingCompleted).toBe(true)
    expect(prefs.payoutsEnabled).toBe(true)
  })

  it('returns stored preference value when set, defaults for unset', async () => {
    // Update membership with partial preferences
    const updatedMembership = await adminTransaction(
      async ({ transaction }) => {
        await updateMembership(
          {
            id: membership.id,
            notificationPreferences: {
              testModeNotifications: true,
              subscriptionCreated: false,
              paymentFailed: false,
            },
          },
          transaction
        )
        const [updated] = await selectMemberships(
          { id: membership.id },
          transaction
        )
        return updated
      }
    )

    const prefs =
      getMembershipNotificationPreferences(updatedMembership)

    // Stored values
    expect(prefs.testModeNotifications).toBe(true)
    expect(prefs.subscriptionCreated).toBe(false)
    expect(prefs.paymentFailed).toBe(false)

    // Default values for unset preferences
    expect(prefs.subscriptionAdjusted).toBe(true)
    expect(prefs.subscriptionCanceled).toBe(true)
    expect(prefs.subscriptionCancellationScheduled).toBe(true)
    expect(prefs.onboardingCompleted).toBe(true)
    expect(prefs.payoutsEnabled).toBe(true)
  })

  it('handles membership with null notificationPreferences', async () => {
    // Force membership to have null preferences (shouldn't happen normally but good to test)
    const membershipWithNull = {
      ...membership,
      notificationPreferences: null,
    } as Membership.Record

    const prefs = getMembershipNotificationPreferences(
      membershipWithNull
    )

    // Should return all defaults
    expect(prefs.testModeNotifications).toBe(false)
    expect(prefs.subscriptionCreated).toBe(true)
    expect(prefs.subscriptionAdjusted).toBe(true)
    expect(prefs.subscriptionCanceled).toBe(true)
    expect(prefs.subscriptionCancellationScheduled).toBe(true)
    expect(prefs.paymentFailed).toBe(true)
    expect(prefs.onboardingCompleted).toBe(true)
    expect(prefs.payoutsEnabled).toBe(true)
  })
})
