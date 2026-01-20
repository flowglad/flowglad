import { describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupMemberships,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { buildNotificationContext } from './notificationContext'

describe('buildNotificationContext', () => {
  describe('base context (organizationId only)', () => {
    it('returns organization record when found', async () => {
      const { organization } = await setupOrg()

      const ctx = await adminTransaction(async ({ transaction }) => {
        return buildNotificationContext(
          { organizationId: organization.id },
          transaction
        )
      })

      expect(ctx.organization.id).toBe(organization.id)
      expect(ctx.organization.name).toBe(organization.name)
    })

    it('throws error when organization not found', async () => {
      const nonExistentId = 'org_non_existent_12345'

      await expect(
        adminTransaction(async ({ transaction }) => {
          return buildNotificationContext(
            { organizationId: nonExistentId },
            transaction
          )
        })
      ).rejects.toThrow(
        `No organizations found with id: ${nonExistentId}`
      )
    })
  })

  describe('customer context', () => {
    it('returns organization and customer when both IDs provided', async () => {
      const { organization } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })

      const ctx = await adminTransaction(async ({ transaction }) => {
        return buildNotificationContext(
          {
            organizationId: organization.id,
            customerId: customer.id,
          },
          transaction
        )
      })

      expect(ctx.organization.id).toBe(organization.id)
      expect('customer' in ctx).toBe(true)
      if ('customer' in ctx) {
        expect(ctx.customer.id).toBe(customer.id)
        expect(ctx.customer.email).toBe(customer.email)
      }
    })

    it('throws error when customer not found', async () => {
      const { organization } = await setupOrg()
      const nonExistentCustomerId = 'cust_non_existent_12345'

      await expect(
        adminTransaction(async ({ transaction }) => {
          return buildNotificationContext(
            {
              organizationId: organization.id,
              customerId: nonExistentCustomerId,
            },
            transaction
          )
        })
      ).rejects.toThrow(
        `No customers found with id: ${nonExistentCustomerId}`
      )
    })
  })

  describe('subscription context', () => {
    it('always fetches subscription when subscriptionId provided, with price and defaultPaymentMethod extras', async () => {
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        paymentMethodId: paymentMethod.id,
      })

      const ctx = await adminTransaction(async ({ transaction }) => {
        return buildNotificationContext(
          {
            organizationId: organization.id,
            customerId: customer.id,
            subscriptionId: subscription.id,
            include: ['price', 'defaultPaymentMethod'],
          },
          transaction
        )
      })

      expect(ctx.organization.id).toBe(organization.id)
      expect('customer' in ctx).toBe(true)
      expect('subscription' in ctx).toBe(true)
      expect('price' in ctx).toBe(true)
      expect('paymentMethod' in ctx).toBe(true)

      if (
        'customer' in ctx &&
        'subscription' in ctx &&
        'price' in ctx &&
        'paymentMethod' in ctx
      ) {
        expect(ctx.customer.id).toBe(customer.id)
        expect(ctx.subscription.id).toBe(subscription.id)
        expect(ctx.price?.id).toBe(price.id)
        expect(ctx.paymentMethod?.id).toBe(paymentMethod.id)
      }
    })

    it('fetches subscription without extras when include is omitted', async () => {
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        paymentMethodId: paymentMethod.id,
      })

      const ctx = await adminTransaction(async ({ transaction }) => {
        return buildNotificationContext(
          {
            organizationId: organization.id,
            customerId: customer.id,
            subscriptionId: subscription.id,
            // no include array - subscription should still be fetched
          },
          transaction
        )
      })

      expect(ctx.organization.id).toBe(organization.id)
      expect('subscription' in ctx).toBe(true)
      expect('price' in ctx).toBe(true)
      expect('paymentMethod' in ctx).toBe(true)

      if (
        'subscription' in ctx &&
        'price' in ctx &&
        'paymentMethod' in ctx
      ) {
        expect(ctx.subscription.id).toBe(subscription.id)
        // price and paymentMethod should be null since not requested via include
        expect(ctx.price).toBeNull()
        expect(ctx.paymentMethod).toBeNull()
      }
    })

    it('fetches price when subscription has priceId and price is in include array', async () => {
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
      })

      const ctx = await adminTransaction(async ({ transaction }) => {
        return buildNotificationContext(
          {
            organizationId: organization.id,
            customerId: customer.id,
            subscriptionId: subscription.id,
            include: ['price', 'defaultPaymentMethod'],
          },
          transaction
        )
      })

      expect('subscription' in ctx).toBe(true)
      expect('price' in ctx).toBe(true)
      if ('subscription' in ctx && 'price' in ctx) {
        expect(ctx.subscription.priceId).toBe(price.id)
        expect(ctx.price?.id).toBe(price.id)
      }
    })

    it('returns null for paymentMethod when customer has no payment methods', async () => {
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      // Note: setupSubscription without paymentMethodId creates a subscription
      // without a default payment method
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        // No paymentMethodId provided
      })

      const ctx = await adminTransaction(async ({ transaction }) => {
        return buildNotificationContext(
          {
            organizationId: organization.id,
            customerId: customer.id,
            subscriptionId: subscription.id,
            include: ['price', 'defaultPaymentMethod'],
          },
          transaction
        )
      })

      expect('paymentMethod' in ctx).toBe(true)
      if ('paymentMethod' in ctx) {
        expect(ctx.paymentMethod).toBeNull()
      }
    })

    it('returns default payment method when multiple exist', async () => {
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      // Create first payment method (non-default)
      const firstPaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        default: false,
      })
      // Create second payment method (default)
      const defaultPaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        default: true,
      })
      const subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        paymentMethodId: defaultPaymentMethod.id,
      })

      const ctx = await adminTransaction(async ({ transaction }) => {
        return buildNotificationContext(
          {
            organizationId: organization.id,
            customerId: customer.id,
            subscriptionId: subscription.id,
            include: ['price', 'defaultPaymentMethod'],
          },
          transaction
        )
      })

      expect('paymentMethod' in ctx).toBe(true)
      if ('paymentMethod' in ctx) {
        expect(ctx.paymentMethod?.id).toBe(defaultPaymentMethod.id)
      }
    })

    it('throws error when subscription not found', async () => {
      const { organization } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const nonExistentSubscriptionId = 'sub_non_existent_12345'

      await expect(
        adminTransaction(async ({ transaction }) => {
          return buildNotificationContext(
            {
              organizationId: organization.id,
              customerId: customer.id,
              subscriptionId: nonExistentSubscriptionId,
              include: ['price', 'defaultPaymentMethod'],
            },
            transaction
          )
        })
      ).rejects.toThrow(
        `No subscriptions found with id: ${nonExistentSubscriptionId}`
      )
    })

    it('throws error when subscription not found even without include array', async () => {
      const { organization } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const nonExistentSubscriptionId = 'sub_non_existent_67890'

      await expect(
        adminTransaction(async ({ transaction }) => {
          return buildNotificationContext(
            {
              organizationId: organization.id,
              customerId: customer.id,
              subscriptionId: nonExistentSubscriptionId,
              // no include array - subscription should still be fetched and throw
            },
            transaction
          )
        })
      ).rejects.toThrow(
        `No subscriptions found with id: ${nonExistentSubscriptionId}`
      )
    })
  })

  describe('organization members context', () => {
    it('returns usersAndMemberships when include contains usersAndMemberships', async () => {
      const { organization } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      // Create memberships for the organization
      await setupMemberships({ organizationId: organization.id })
      await setupMemberships({ organizationId: organization.id })

      const ctx = await adminTransaction(async ({ transaction }) => {
        return buildNotificationContext(
          {
            organizationId: organization.id,
            customerId: customer.id,
            include: ['usersAndMemberships'],
          },
          transaction
        )
      })

      expect(ctx.organization.id).toBe(organization.id)
      expect('customer' in ctx).toBe(true)
      expect('usersAndMemberships' in ctx).toBe(true)

      if ('usersAndMemberships' in ctx) {
        expect(Array.isArray(ctx.usersAndMemberships)).toBe(true)
        expect(ctx.usersAndMemberships.length).toBe(2)
        // Verify structure of each entry
        for (const entry of ctx.usersAndMemberships) {
          expect(typeof entry.user.id).toBe('string')
          expect(typeof entry.user.email).toBe('string')
          expect(typeof entry.membership.id).toBe('string')
          expect(entry.membership.organizationId).toBe(
            organization.id
          )
        }
      }
    })

    it('returns empty array when organization has no members', async () => {
      const { organization } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      // Note: setupOrg doesn't create memberships by default

      const ctx = await adminTransaction(async ({ transaction }) => {
        return buildNotificationContext(
          {
            organizationId: organization.id,
            customerId: customer.id,
            include: ['usersAndMemberships'],
          },
          transaction
        )
      })

      expect('usersAndMemberships' in ctx).toBe(true)
      if ('usersAndMemberships' in ctx) {
        expect(Array.isArray(ctx.usersAndMemberships)).toBe(true)
        expect(ctx.usersAndMemberships.length).toBe(0)
      }
    })
  })
})
