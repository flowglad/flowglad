import { describe, it, expect, beforeEach } from 'vitest'
import * as core from 'nanoid'

// Schema imports
import { Organization } from '@/db/schema/organizations'
import { UsageEvent } from '@/db/schema/usageEvents'
import { UsageLedgerItem } from '@/db/schema/usageLedgerItems'
import { UsageTransaction } from '@/db/schema/usageTransactions'
import { Subscription } from '@/db/schema/subscriptions' // Assuming this schema and type exist

// Setup helpers from seedDatabase.ts (adjust path as necessary if different)
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
} from '@/../seedDatabase'

import { DbTransaction } from '@/db/types'

// Enum/type imports from @/types
import {
  UsageLedgerItemDirection,
  UsageLedgerItemEntryType,
  UsageLedgerItemStatus,
  UsageTransactionInitiatingSourceType,
} from '@/types'

// Function to test
import { createUsageEventLedgerTransaction } from '@/utils/usage/usageLedgerHelpers'
import { adminTransaction } from '@/db/adminTransaction'

// Global transaction provided by the test environment for each test case.
// This is assumed based on `new-test-suite.txt` examples where `transaction`
// is used in `it` blocks without explicit local declaration or being passed from `beforeEach`.
// The actual test runner setup (e.g., Jest environment) would be responsible for providing this.
declare let transaction: DbTransaction

describe('usageLedgerHelpers', () => {
  let organization: Organization.Record
  let subscription: Subscription.Record
  // Define usageEventInput with only properties known to UsageEvent.Record and used by the function
  let usageEventInput: Pick<
    UsageEvent.Record,
    | 'id'
    | 'livemode'
    | 'subscriptionId'
    | 'amount'
    | 'createdAt'
    | 'updatedAt'
  >

  beforeEach(async () => {
    // Per "Very Important Notes #1" in new-test-suite.txt: "Always use setupOrg() in beforeEach"
    // Assuming setupOrg and setupSubscription implicitly use the ambient 'transaction'
    // or are configured to work within the test runner's transactional context.
    const { organization: orgData, price } = await setupOrg() // Assuming setupOrg() returns { organization: Organization.Record, ... }
    const customer = await setupCustomer({
      organizationId: orgData.id,
    })
    const paymentMethod = await setupPaymentMethod({
      organizationId: orgData.id,
      customerId: customer.id,
    })
    organization = orgData
    // Assuming setupSubscription helper exists and creates a valid subscription
    // It would also likely use the ambient transaction.
    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
    })

    usageEventInput = {
      id: `uev_${core.nanoid()}`,
      livemode: true, // Defaulting livemode for test setup consistency
      subscriptionId: subscription.id,
      amount: 100, // Positive amount, ensuring it's > 0 as per function's internal check
      createdAt: new Date(),
      updatedAt: new Date(),
      // Removed fields like idempotencyKey, eventName, properties, processedAt, source
      // as they caused type errors, implying they are not in the core UsageEvent.Record type
      // or at least not in the part of it relevant to Omit<..., 'organizationId'>
    }
  })

  describe('createUsageEventLedgerTransaction', () => {
    it('should create a UsageTransaction and a UsageLedgerItem with correct properties on a happy path', async () => {
      const result = await adminTransaction(
        async ({ transaction }) => {
          return createUsageEventLedgerTransaction(
            {
              usageEvent: usageEventInput as UsageEvent.Record,
              organizationId: organization.id,
            },
            transaction
          )
        }
      )

      expect(result).toBeDefined()
      expect(result.usageTransaction).toBeDefined()
      expect(result.usageLedgerItems).toBeInstanceOf(Array)
      expect(result.usageLedgerItems.length).toBe(1)

      const createdUsageTransaction = result.usageTransaction
      const createdUsageLedgerItem = result.usageLedgerItems[0]

      // Assertions for UsageTransaction
      expect(createdUsageTransaction.livemode).toBe(
        usageEventInput.livemode
      )
      expect(createdUsageTransaction.organizationId).toBe(
        organization.id
      )
      expect(createdUsageTransaction.description).toBe(
        `Ingesting Usage Event ${usageEventInput.id}`
      )
      expect(createdUsageTransaction.initiatingSourceType).toBe(
        UsageTransactionInitiatingSourceType.UsageEvent
      )
      expect(createdUsageTransaction.initiatingSourceId).toBe(
        usageEventInput.id
      )
      // Optionally, check if id is a valid format, e.g., not null/undefined
      expect(createdUsageTransaction.id).toBeDefined()

      // Assertions for UsageLedgerItem
      expect(createdUsageLedgerItem.status).toBe(
        UsageLedgerItemStatus.Posted
      )
      expect(createdUsageLedgerItem.livemode).toBe(
        usageEventInput.livemode
      )
      expect(createdUsageLedgerItem.organizationId).toBe(
        organization.id
      )
      expect(createdUsageLedgerItem.usageTransactionId).toBe(
        createdUsageTransaction.id
      )
      expect(createdUsageLedgerItem.subscriptionId).toBe(
        usageEventInput.subscriptionId
      )
      expect(createdUsageLedgerItem.direction).toBe(
        UsageLedgerItemDirection.Debit
      )
      expect(createdUsageLedgerItem.entryType).toBe(
        UsageLedgerItemEntryType.UsageCost
      )
      expect(createdUsageLedgerItem.amount).toBe(
        usageEventInput.amount
      )
      expect(createdUsageLedgerItem.description).toBe(
        `Ingesting Usage Event ${usageEventInput.id}`
      )
      // Optionally, check if id is a valid format
      expect(createdUsageLedgerItem.id).toBeDefined()
    })
  })
})
