import { describe, expect, it } from 'bun:test'
import { MembershipRole } from '@db-core/enums'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type Membership,
  type NotificationPreferences,
} from '@db-core/schema/memberships'
import { getMembershipNotificationPreferences } from './membershipMethods'

describe('getMembershipNotificationPreferences', () => {
  const baseMembership: Membership.Record = {
    id: 'memb_test123',
    userId: 'user_123',
    organizationId: 'org_123',
    focused: true,
    notificationPreferences: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    createdByCommit: null,
    updatedByCommit: null,
    position: 0,
    livemode: true,
    focusedPricingModelId: 'pm_test123',
    role: MembershipRole.Owner,
    deactivatedAt: null,
  }

  it('returns all default preferences when membership has empty notificationPreferences', () => {
    const membership: Membership.Record = {
      ...baseMembership,
      notificationPreferences: {},
    }

    const result = getMembershipNotificationPreferences(membership)

    expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
    expect(result.testModeNotifications).toBe(true)
    expect(result.subscriptionCreated).toBe(true)
    expect(result.subscriptionAdjusted).toBe(true)
    expect(result.subscriptionCanceled).toBe(true)
    expect(result.subscriptionCancellationScheduled).toBe(true)
    expect(result.paymentFailed).toBe(true)
    expect(result.paymentSuccessful).toBe(true)
  })

  it('returns all default preferences when membership has null notificationPreferences', () => {
    const membership: Membership.Record = {
      ...baseMembership,
      notificationPreferences: null,
    }

    const result = getMembershipNotificationPreferences(membership)

    expect(result).toEqual(DEFAULT_NOTIFICATION_PREFERENCES)
  })

  it('merges stored preferences with defaults, with stored values taking precedence', () => {
    const storedPrefs: Partial<NotificationPreferences> = {
      testModeNotifications: true,
      subscriptionCreated: false,
    }
    const membership: Membership.Record = {
      ...baseMembership,
      notificationPreferences: storedPrefs,
    }

    const result = getMembershipNotificationPreferences(membership)

    expect(result.testModeNotifications).toBe(true)
    expect(result.subscriptionCreated).toBe(false)
    expect(result.subscriptionAdjusted).toBe(true)
    expect(result.subscriptionCanceled).toBe(true)
    expect(result.subscriptionCancellationScheduled).toBe(true)
    expect(result.paymentFailed).toBe(true)
    expect(result.paymentSuccessful).toBe(true)
  })

  it('returns stored preferences when all preferences are explicitly set', () => {
    const fullPrefs: NotificationPreferences = {
      testModeNotifications: true,
      subscriptionCreated: false,
      subscriptionAdjusted: false,
      subscriptionCanceled: false,
      subscriptionCancellationScheduled: false,
      paymentFailed: false,
      paymentSuccessful: false,
    }
    const membership: Membership.Record = {
      ...baseMembership,
      notificationPreferences: fullPrefs,
    }

    const result = getMembershipNotificationPreferences(membership)

    expect(result).toEqual(fullPrefs)
  })

  it('fills in new preference fields when membership has legacy stored preferences missing new fields', () => {
    const legacyPrefs = {
      testModeNotifications: true,
      subscriptionCreated: false,
    }
    const membership: Membership.Record = {
      ...baseMembership,
      notificationPreferences: legacyPrefs,
    }

    const result = getMembershipNotificationPreferences(membership)

    expect(result.testModeNotifications).toBe(true)
    expect(result.subscriptionCreated).toBe(false)
    expect(result.subscriptionAdjusted).toBe(true)
    expect(result.subscriptionCanceled).toBe(true)
    expect(result.subscriptionCancellationScheduled).toBe(true)
    expect(result.paymentFailed).toBe(true)
    expect(result.paymentSuccessful).toBe(true)
  })
})
