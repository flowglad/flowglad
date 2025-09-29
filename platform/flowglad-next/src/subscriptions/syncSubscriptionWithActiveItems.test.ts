import { describe, expect, it, beforeEach, vi } from 'vitest'
import { syncSubscriptionWithActiveItems } from './adjustSubscription'
import {
  setupOrg,
  setupUserAndCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupInvoice,
  setupBillingPeriod,
  setupSubscriptionItem,
} from '@/../seedDatabase'
import type { Organization } from '@/db/schema/organizations'
import type { User } from '@/db/schema/users'
import type { Customer } from '@/db/schema/customers'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Subscription } from '@/db/schema/subscriptions'
import type { Invoice } from '@/db/schema/invoices'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Product } from '@/db/schema/products'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import {
  InvoiceStatus,
  SubscriptionItemType,
  SubscriptionStatus,
  BillingPeriodStatus,
} from '@/types'
import { adminTransaction } from '@/db/adminTransaction'
import { updateSubscriptionItem, expireSubscriptionItem } from '@/db/tableMethods/subscriptionItemMethods'
import { selectSubscriptionById, updateSubscription } from '@/db/tableMethods/subscriptionMethods'
import { addDays, subDays } from 'date-fns'

vi.mock('@/env', () => ({
  env: {
    STRIPE_SECRET_KEY: 'fake-stripe-key',
    DATABASE_URL: 'fake-database-url',
  }
}))

let organization: Organization.Record
let pricingModel: PricingModel.Record
let product: Product.Record
let price: Price.Record
let user: User.Record
let customer: Customer.Record
let paymentMethod: PaymentMethod.Record
let subscription: Subscription.Record
let billingPeriod: BillingPeriod.Record
let invoice: Invoice.Record

beforeEach(async () => {
  vi.clearAllMocks()

  const orgData = await setupOrg()
  organization = orgData.organization
  pricingModel = orgData.pricingModel
  product = orgData.product
  price = orgData.price

  const userData = await setupUserAndCustomer({
    organizationId: organization.id,
    livemode: true,
  })
  user = userData.user
  customer = userData.customer

  paymentMethod = await setupPaymentMethod({
    organizationId: organization.id,
    customerId: customer.id,
    livemode: true,
  })

  const now = new Date()
  const billingPeriodStart = subDays(now, 15) // 15 days ago
  const billingPeriodEnd = addDays(now, 15) // 15 days from now

  subscription = await setupSubscription({
    organizationId: organization.id,
    customerId: customer.id,
    priceId: price.id,
    paymentMethodId: paymentMethod.id,
    status: SubscriptionStatus.Active,
    currentBillingPeriodStart: billingPeriodStart,
    currentBillingPeriodEnd: billingPeriodEnd,
    livemode: true,
  })

  billingPeriod = await setupBillingPeriod({
    subscriptionId: subscription.id,
    startDate: billingPeriodStart,
    endDate: billingPeriodEnd,
    status: BillingPeriodStatus.Active,
    livemode: true,
  })

  invoice = await setupInvoice({
    organizationId: organization.id,
    customerId: customer.id,
    billingPeriodId: billingPeriod.id,
    priceId: price.id,
    livemode: true,
    status: InvoiceStatus.Paid,
  })
})

describe('syncSubscriptionWithActiveItems - Billing Period Rollover Scenarios', () => {
  it('should sync subscription with currently active items', async () => {
    await adminTransaction(async ({ transaction }) => {
      const now = new Date()
      const futureDate = addDays(now, 1) // Tomorrow
      
      // Setup: Create current active item
      const currentItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Current Plan',
        quantity: 1,
        unitPrice: 999, // $9.99
        addedDate: subDays(now, 10), // Started 10 days ago
        type: SubscriptionItemType.Static,
      })
      
      // Expire the current item in the future
      await expireSubscriptionItem(currentItem.id, futureDate, transaction)
      
      // Setup: Create future item that will become active tomorrow
      const futureItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'New Premium Plan',
        quantity: 1,
        unitPrice: 4999, // $49.99
        addedDate: futureDate, // Starts tomorrow
        type: SubscriptionItemType.Static,
      })
      
      // Test: Sync should use current item (future item not active yet)
      const synced = await syncSubscriptionWithActiveItems(
        subscription.id,
        transaction
      )
      expect(synced.name).toBe('Current Plan')
      expect(synced.priceId).toBe(currentItem.priceId)
    })
  })

  it('should handle multiple items becoming active and choose the most expensive as primary', async () => {
    await adminTransaction(async ({ transaction }) => {
      const now = new Date()
      const pastDate = subDays(now, 1) // Yesterday
      
      // Setup: Create multiple items that are all currently active
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Basic Feature',
        quantity: 1,
        unitPrice: 500, // $5.00
        addedDate: pastDate,
        type: SubscriptionItemType.Static,
      })
      
      const premiumItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Premium Feature',
        quantity: 1,
        unitPrice: 3000, // $30.00 - Most expensive
        addedDate: pastDate,
        type: SubscriptionItemType.Static,
      })
      
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Standard Feature',
        quantity: 1,
        unitPrice: 1500, // $15.00
        addedDate: pastDate,
        type: SubscriptionItemType.Static,
      })
      
      // All items are active now - should choose the most expensive (Premium Feature)
      const synced = await syncSubscriptionWithActiveItems(
        subscription.id,
        transaction
      )
      
      expect(synced.name).toBe('Premium Feature')
      expect(synced.priceId).toBe(premiumItem.priceId)
    })
  })

  it('should handle subscription becoming active but not primary (lower price than existing)', async () => {
    await adminTransaction(async ({ transaction }) => {
      const now = new Date()
      const futureDate = addDays(now, 1)
      
      // Setup: Create expensive current item
      const expensiveItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Enterprise Plan',
        quantity: 1,
        unitPrice: 9999, // $99.99 - Most expensive
        addedDate: subDays(now, 10),
        type: SubscriptionItemType.Static,
      })
      
      // Setup: Create cheaper item that is also active
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Add-on Feature',
        quantity: 1,
        unitPrice: 999, // $9.99 - Cheaper
        addedDate: subDays(now, 1), // Already active since yesterday
        type: SubscriptionItemType.Static,
      })
      
      // Both are active now - should still use Enterprise Plan as primary
      const synced = await syncSubscriptionWithActiveItems(
        subscription.id,
        transaction
      )
      
      expect(synced.name).toBe('Enterprise Plan')
      expect(synced.priceId).toBe(expensiveItem.priceId)
    })
  })

  it('should update primary when current primary item gets cancelled', async () => {
    await adminTransaction(async ({ transaction }) => {
      const now = new Date()
      
      // Setup: Create multiple active items
      const primaryItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Premium Plan',
        quantity: 1,
        unitPrice: 4999, // $49.99 - Initially most expensive
        addedDate: subDays(now, 10),
        type: SubscriptionItemType.Static,
      })
      
      const secondaryItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Standard Plan',
        quantity: 1,
        unitPrice: 2999, // $29.99 - Second most expensive
        addedDate: subDays(now, 5),
        type: SubscriptionItemType.Static,
      })
      
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Basic Plan',
        quantity: 1,
        unitPrice: 999, // $9.99 - Cheapest
        addedDate: subDays(now, 3),
        type: SubscriptionItemType.Static,
      })
      
      // Initial sync - should use Premium Plan
      const syncedBefore = await syncSubscriptionWithActiveItems(
        subscription.id,
        transaction
      )
      expect(syncedBefore.name).toBe('Premium Plan')
      
      // Cancel the primary item - set as already expired
      await updateSubscriptionItem({
        id: primaryItem.id,
        expiredAt: subDays(now, 1), // Already expired yesterday
        type: SubscriptionItemType.Static,
      }, transaction)
      
      // Sync after cancellation - should switch to Standard Plan
      const syncedAfter = await syncSubscriptionWithActiveItems(
        subscription.id,
        transaction
      )
      expect(syncedAfter.name).toBe('Standard Plan')
      expect(syncedAfter.priceId).toBe(secondaryItem.priceId)
    })
  })

  it('should handle multiple items becoming active and inactive simultaneously', async () => {
    await adminTransaction(async ({ transaction }) => {
      const now = new Date()
      
      // Setup: Currently active items (old items)
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Old Basic',
        quantity: 1,
        unitPrice: 999,
        addedDate: subDays(now, 10),
        type: SubscriptionItemType.Static,
      })
      
      const oldPremiumItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Old Premium',
        quantity: 1,
        unitPrice: 4999,
        addedDate: subDays(now, 10),
        type: SubscriptionItemType.Static,
      })
      
      // Setup: New items that are also active now (simulating post-rollover state)
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'New Basic',
        quantity: 1,
        unitPrice: 1999, // $19.99
        addedDate: subDays(now, 1), // Started yesterday
        type: SubscriptionItemType.Static,
      })
      
      const newPremiumItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'New Premium',
        quantity: 1,
        unitPrice: 6999, // $69.99 - Most expensive overall
        addedDate: subDays(now, 1), // Started yesterday
        type: SubscriptionItemType.Static,
      })
      
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'New Add-on',
        quantity: 1,
        unitPrice: 500, // $5.00
        addedDate: subDays(now, 1), // Started yesterday
        type: SubscriptionItemType.Static,
      })
      
      // With all items active - should use New Premium (most expensive)
      const synced = await syncSubscriptionWithActiveItems(
        subscription.id,
        transaction
      )
      expect(synced.name).toBe('New Premium')
      expect(synced.priceId).toBe(newPremiumItem.priceId)
    })
  })

  it('should maintain subscription state when all items expire with no replacements', async () => {
    await adminTransaction(async ({ transaction }) => {
      const now = new Date()
      
      // Setup: Create an active item first
      const activeItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Active Plan',
        quantity: 1,
        unitPrice: 2999,
        addedDate: subDays(now, 10),
        type: SubscriptionItemType.Static,
      })
      
      // First, sync while the item is active to set the subscription name
      const syncedActive = await syncSubscriptionWithActiveItems(
        subscription.id,
        transaction
      )
      expect(syncedActive.name).toBe('Active Plan')
      
      // Now expire the item
      await updateSubscriptionItem({
        id: activeItem.id,
        expiredAt: subDays(now, 1), // Already expired
        type: SubscriptionItemType.Static,
      }, transaction)
      
      // Sync after expiration with no active items
      const syncedAfterExpiry = await syncSubscriptionWithActiveItems(
        subscription.id,
        transaction
      )
      
      // Should maintain the last known state (Active Plan)
      expect(syncedAfterExpiry.name).toBe('Active Plan')
      expect(syncedAfterExpiry.priceId).toBe(price.id)
      expect(syncedAfterExpiry.id).toBe(subscription.id)
    })
  })

  it('should handle quantity changes affecting total price calculations', async () => {
    await adminTransaction(async ({ transaction }) => {
      const now = new Date()
      
      // Setup: Item with high unit price but low quantity
      const highUnitPriceItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'High Unit Price',
        quantity: 1,
        unitPrice: 5000, // $50 per unit, total = $50
        addedDate: subDays(now, 5),
        type: SubscriptionItemType.Static,
      })
      
      // Setup: Item with low unit price but high quantity
      const highQuantityItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'High Quantity',
        quantity: 10,
        unitPrice: 1000, // $10 per unit, total = $100 (MORE expensive)
        addedDate: subDays(now, 5),
        type: SubscriptionItemType.Static,
      })
      
      // Sync - should choose high quantity item (higher total)
      const synced = await syncSubscriptionWithActiveItems(
        subscription.id,
        transaction
      )
      
      expect(synced.name).toBe('High Quantity')
      expect(synced.priceId).toBe(highQuantityItem.priceId)
    })
  })

  it('should use addedDate as tiebreaker when items have same total price', async () => {
    await adminTransaction(async ({ transaction }) => {
      const now = new Date()
      
      // Setup: Two items with same total price
      await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Older Item',
        quantity: 1,
        unitPrice: 3000, // $30.00
        addedDate: subDays(now, 10), // Older
        type: SubscriptionItemType.Static,
      })
      
      const newerItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: price.id,
        name: 'Newer Item',
        quantity: 1,
        unitPrice: 3000, // Same price: $30.00
        addedDate: subDays(now, 5), // Newer - should win
        type: SubscriptionItemType.Static,
      })
      
      // Sync - should choose newer item as tiebreaker
      const synced = await syncSubscriptionWithActiveItems(
        subscription.id,
        transaction
      )
      
      expect(synced.name).toBe('Newer Item')
      expect(synced.priceId).toBe(newerItem.priceId)
    })
  })
})