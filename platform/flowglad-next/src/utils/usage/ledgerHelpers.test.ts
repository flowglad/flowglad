import { describe, it, expect, beforeEach } from 'vitest'
import { nanoid } from 'nanoid'

import { Organization } from '@/db/schema/organizations'
import { UsageEvent } from '@/db/schema/usageEvents'
import { Subscription } from '@/db/schema/subscriptions' // Assuming this schema and type exist

// Setup helpers from seedDatabase.ts (adjust path as necessary if different)
import {
  setupCustomer,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
  setupUsageMeter,
  setupLedgerAccount,
} from '@/../seedDatabase'

import { DbTransaction } from '@/db/types'

// Enum/type imports from @/types
import {
  LedgerEntryDirection,
  LedgerEntryType,
  LedgerEntryStatus,
  LedgerTransactionInitiatingSourceType,
} from '@/types'

// Function to test
import { createUsageEventLedgerTransaction } from '@/utils/usage/ledgerHelpers'
import { adminTransaction } from '@/db/adminTransaction'
import { UsageMeter } from '@/db/schema/usageMeters'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'

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
    | 'usageMeterId'
  >
  let usageMeter: UsageMeter.Record
  let ledgerAccount: LedgerAccount.Record
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
    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'test-usage-meter',
    })
    ledgerAccount = await setupLedgerAccount({
      subscriptionId: subscription.id,
      usageMeterId: usageMeter.id,
      livemode: true,
      organizationId: organization.id,
    })
    usageEventInput = {
      id: `uev_${nanoid()}`,
      livemode: true, // Defaulting livemode for test setup consistency
      subscriptionId: subscription.id,
      amount: 100, // Positive amount, ensuring it's > 0 as per function's internal check
      createdAt: new Date(),
      updatedAt: new Date(),
      usageMeterId: usageMeter.id,
    }
  })

  describe('createUsageEventLedgerTransaction', () => {
    it('should create a LedgerTransaction and a LedgerEntry with correct properties on a happy path', async () => {
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
      expect(result.ledgerTransaction).toBeDefined()
      expect(result.ledgerEntries).toBeInstanceOf(Array)
      expect(result.ledgerEntries.length).toBe(1)

      const createdLedgerTransaction = result.ledgerTransaction
      const createdLedgerEntry = result.ledgerEntries[0]
      if (!createdLedgerTransaction) {
        throw new Error('Usage transaction was not created')
      }
      // Assertions for LedgerTransaction
      expect(createdLedgerTransaction.livemode).toBe(
        usageEventInput.livemode
      )
      expect(createdLedgerTransaction.organizationId).toBe(
        organization.id
      )
      expect(createdLedgerTransaction.description).toBe(
        `Ingesting Usage Event ${usageEventInput.id}`
      )
      expect(createdLedgerTransaction.initiatingSourceType).toBe(
        LedgerTransactionInitiatingSourceType.UsageEvent
      )
      expect(createdLedgerTransaction.initiatingSourceId).toBe(
        usageEventInput.id
      )
      // Optionally, check if id is a valid format, e.g., not null/undefined
      expect(createdLedgerTransaction.id).toBeDefined()

      // Assertions for LedgerEntry
      expect(createdLedgerEntry.status).toBe(LedgerEntryStatus.Posted)
      expect(createdLedgerEntry.livemode).toBe(
        usageEventInput.livemode
      )
      expect(createdLedgerEntry.organizationId).toBe(organization.id)
      expect(createdLedgerEntry.ledgerTransactionId).toBe(
        createdLedgerTransaction.id
      )
      expect(createdLedgerEntry.subscriptionId).toBe(
        usageEventInput.subscriptionId
      )
      expect(createdLedgerEntry.direction).toBe(
        LedgerEntryDirection.Debit
      )
      expect(createdLedgerEntry.entryType).toBe(
        LedgerEntryType.UsageCost
      )
      expect(createdLedgerEntry.amount).toBe(usageEventInput.amount)
      expect(createdLedgerEntry.description).toBe(
        `Ingesting Usage Event ${usageEventInput.id}`
      )
      // Optionally, check if id is a valid format
      expect(createdLedgerEntry.id).toBeDefined()
    })
  })
})
