import { describe, it, beforeEach, expect } from 'vitest'
import { core } from '@/utils/core'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupSubscription,
  setupBillingPeriod,
  setupLedgerAccount,
  setupUsageMeter,
  setupLedgerTransaction,
  setupDebitLedgerEntry,
  setupCreditLedgerEntry,
  setupPayment,
  setupInvoice,
  setupUsageEvent,
  setupUsageCredit,
  setupUsageCreditApplication,
  setupRefund,
  setupLedgerEntries,
} from '@/../seedDatabase'
import { Organization } from '@/db/schema/organizations'
import { Price } from '@/db/schema/prices'
import { Customer } from '@/db/schema/customers'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'
import { UsageMeter } from '@/db/schema/usageMeters'
import { Catalog } from '@/db/schema/catalogs'
import { Product } from '@/db/schema/products'
import { LedgerTransaction } from '@/db/schema/ledgerTransactions'
import {
  LedgerEntryStatus,
  LedgerEntryDirection,
  PaymentMethodType,
  SubscriptionStatus,
  PaymentStatus,
  LedgerTransactionType,
  LedgerEntryType,
  UsageCreditType,
  RefundStatus,
} from '@/types'
import { adminTransaction } from '@/db/adminTransaction'
import {
  bulkInsertLedgerEntries,
  aggregateBalanceForLedgerAccountFromEntries,
  aggregateAvailableBalanceForUsageCredit,
} from './ledgerEntryMethods'
import {
  LedgerEntry,
  ledgerEntryNulledSourceIdColumns,
} from '../schema/ledgerEntries'

describe('ledgerEntryMethods', () => {
  let organization: Organization.Record
  let catalog: Catalog.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record
  let billingPeriod: BillingPeriod.Record
  let ledgerAccount: LedgerAccount.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    price = orgData.price
    catalog = orgData.catalog
    product = orgData.product

    customer = await setupCustomer({
      organizationId: organization.id,
      email: `customer+${core.nanoid()}@test.com`,
      livemode: true,
    })

    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
      type: PaymentMethodType.Card,
      livemode: true,
    })

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      catalogId: catalog.id,
      livemode: true,
    })

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      currentBillingPeriodStart: new Date(
        Date.now() - 30 * 24 * 60 * 60 * 1000
      ),
      currentBillingPeriodEnd: new Date(
        Date.now() + 1 * 24 * 60 * 60 * 1000
      ),
      livemode: true,
    })

    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart!,
      endDate: subscription.currentBillingPeriodEnd!,
      livemode: subscription.livemode,
    })

    ledgerAccount = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter.id,
      livemode: subscription.livemode,
    })
  })

  describe('bulkInsertLedgerEntries', () => {
    it('should return an empty array when given an empty array of entries', async () => {
      await adminTransaction(async ({ transaction }) => {
        const result = await bulkInsertLedgerEntries([], transaction)
        expect(result).toEqual([])
      })
    })
    it('should successfully insert a single valid ledger entry and return it', async () => {
      const localLedgerTransaction = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
      const usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter',
        catalogId: catalog.id,
        livemode: true,
      })
      const usageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
        amount: 100,
        priceId: price.id,
        billingPeriodId: billingPeriod.id,
        transactionId: localLedgerTransaction.id,
        customerId: customer.id,
      })
      await adminTransaction(async ({ transaction }) => {
        const entryData: LedgerEntry.Insert = {
          ...ledgerEntryNulledSourceIdColumns,
          metadata: {},
          discardedAt: null,
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: localLedgerTransaction.id,
          entryType: LedgerEntryType.UsageCost,
          direction: LedgerEntryDirection.Debit,
          amount: 100,
          status: LedgerEntryStatus.Posted,
          livemode: true,
          entryTimestamp: new Date(),
          sourceUsageEventId: usageEvent.id,
        }
        const result = await bulkInsertLedgerEntries(
          [entryData],
          transaction
        )
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject(entryData)
      })
    })
    it('should successfully insert multiple valid ledger entries and return them', async () => {
      await adminTransaction(async ({ transaction }) => {
        const localLedgerTransaction = await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
        const usageEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          livemode: true,
          amount: 100,
          priceId: price.id,
          billingPeriodId: billingPeriod.id,
          transactionId: localLedgerTransaction.id,
          customerId: customer.id,
        })
        const entryData1: LedgerEntry.Insert = {
          ...ledgerEntryNulledSourceIdColumns,
          metadata: {},
          discardedAt: null,
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: localLedgerTransaction.id,
          entryType: LedgerEntryType.UsageCost,
          direction: LedgerEntryDirection.Debit,
          amount: 100,
          status: LedgerEntryStatus.Posted,
          livemode: true,
          entryTimestamp: new Date(),
          sourceUsageEventId: usageEvent.id,
        }
        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          livemode: true,
          issuedAmount: 1000,
          creditType: UsageCreditType.Grant,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
        })
        const entryData2: LedgerEntry.Insert = {
          ...ledgerEntryNulledSourceIdColumns,
          metadata: {},
          discardedAt: null,
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: localLedgerTransaction.id,
          entryType: LedgerEntryType.CreditGrantRecognized,
          direction: LedgerEntryDirection.Credit,
          amount: 50,
          status: LedgerEntryStatus.Posted,
          livemode: true,
          sourceUsageCreditId: usageCredit.id,
          entryTimestamp: new Date(),
        }
        const result = await bulkInsertLedgerEntries(
          [entryData1, entryData2],
          transaction
        )
        expect(result).toHaveLength(2)
        expect(result[0]).toMatchObject(entryData1)
        expect(result[1]).toMatchObject(entryData2)
      })
    })
    it('should ensure all inserted entries have the correct common properties (e.g., organizationId, livemode if applicable)', async () => {
      await adminTransaction(async ({ transaction }) => {
        const localLedgerTransaction = await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
        const usageEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          livemode: true,
          amount: 100,
          priceId: price.id,
          billingPeriodId: billingPeriod.id,
          transactionId: localLedgerTransaction.id,
          customerId: customer.id,
        })

        const entryData1: LedgerEntry.Insert = {
          ...ledgerEntryNulledSourceIdColumns,
          metadata: {},
          discardedAt: null,
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: localLedgerTransaction.id,
          entryType: LedgerEntryType.UsageCost,
          direction: LedgerEntryDirection.Debit,
          amount: 100,
          status: LedgerEntryStatus.Posted,
          livemode: true,
          entryTimestamp: new Date(),
          sourceUsageEventId: usageEvent.id,
        }
        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          livemode: true,
          issuedAmount: 1000,
          creditType: UsageCreditType.Grant,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
        })
        const entryData2: LedgerEntry.Insert = {
          ...ledgerEntryNulledSourceIdColumns,
          metadata: {},
          discardedAt: null,
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: localLedgerTransaction.id,
          entryType: LedgerEntryType.CreditGrantRecognized,
          direction: LedgerEntryDirection.Credit,
          amount: 50,
          status: LedgerEntryStatus.Posted,
          livemode: false,
          entryTimestamp: new Date(),
          sourceUsageCreditId: usageCredit.id,
        }
        const result = await bulkInsertLedgerEntries(
          [entryData1, entryData2],
          transaction
        )
        expect(result).toHaveLength(2)
        expect(result[0].organizationId).toBe(organization.id)
        expect(result[0].livemode).toBe(true)
        expect(result[1].organizationId).toBe(organization.id)
        expect(result[1].livemode).toBe(false)
      })
    })
    it('should call the transaction insert method with the provided data', async () => {
      await adminTransaction(async ({ transaction }) => {
        const localLedgerTransaction = await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
        const usageEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          livemode: true,
          amount: 100,
          priceId: price.id,
          billingPeriodId: billingPeriod.id,
          transactionId: localLedgerTransaction.id,
          customerId: customer.id,
        })
        const entryData: LedgerEntry.Insert = {
          ...ledgerEntryNulledSourceIdColumns,
          metadata: {},
          discardedAt: null,
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: localLedgerTransaction.id,
          entryType: LedgerEntryType.UsageCost,
          direction: LedgerEntryDirection.Debit,
          amount: 100,
          status: LedgerEntryStatus.Posted,
          livemode: true,
          entryTimestamp: new Date(),
          sourceUsageEventId: usageEvent.id,
        }
        const result = await bulkInsertLedgerEntries(
          [entryData],
          transaction
        )
        expect(result).toHaveLength(1)
        expect(result[0].id).toBeDefined()
      })
    })
  })

  describe('aggregateBalanceForLedgerAccountFromEntries', () => {
    let testLedgerTransaction: LedgerTransaction.Record
    let paymentId1: string
    let usageEventId: string
    let usageCreditId: string
    let refundId: string
    beforeEach(async () => {
      testLedgerTransaction = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })
      const invoice1 = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        livemode: true,
        priceId: price.id,
      })
      const payment1 = await setupPayment({
        organizationId: organization.id,
        customerId: customer.id,
        amount: 100,
        subscriptionId: subscription.id,
        livemode: true,
        stripeChargeId: 'ch_123' + Math.random().toString(36),
        status: PaymentStatus.Succeeded,
        invoiceId: invoice1.id,
      })
      paymentId1 = payment1.id
      const refund = await setupRefund({
        organizationId: organization.id,
        livemode: true,
        amount: 100,
        paymentId: payment1.id,
        status: RefundStatus.Succeeded,
        subscriptionId: subscription.id,
        currency: payment1.currency,
      })
      refundId = refund.id
      const usageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
        amount: 100,
        priceId: price.id,
        billingPeriodId: billingPeriod.id,
        transactionId: core.nanoid(),
        customerId: customer.id,
        properties: {},
      })
      usageEventId = usageEvent.id
      const usageCredit = await setupUsageCredit({
        organizationId: organization.id,
        livemode: true,
        issuedAmount: 1000,
        creditType: UsageCreditType.Grant,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
      })
      usageCreditId = usageCredit.id
    })

    describe('balanceType: "posted"', () => {
      it('should return 0 if no posted entries exist for the ledger account', async () => {
        await setupCreditLedgerEntry({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: testLedgerTransaction.id,
          entryType: LedgerEntryType.CreditGrantRecognized,
          amount: 100,
          status: LedgerEntryStatus.Pending,
          sourceUsageCreditId: usageCreditId,
        })
        await adminTransaction(async ({ transaction }) => {
          // Setup a pending entry to ensure only posted are considered
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'posted',
              transaction
            )
          expect(balance).toBe(0)
        })
      })
      it('should correctly sum amounts for multiple posted credit entries', async () => {
        await adminTransaction(async ({ transaction }) => {
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 1000,
            status: LedgerEntryStatus.Posted,
            sourceUsageCreditId: usageCreditId,
          })
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 500,
            status: LedgerEntryStatus.Posted,
            sourceUsageCreditId: usageCreditId,
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'posted',
              transaction
            )
          expect(balance).toBe(1500)
        })
      })
      it('should correctly sum amounts for multiple posted debit entries (resulting in a negative balance)', async () => {
        await setupDebitLedgerEntry({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: testLedgerTransaction.id,
          entryType: LedgerEntryType.PaymentRefunded,
          amount: 300,
          status: LedgerEntryStatus.Posted,
          sourceRefundId: refundId,
        })

        await adminTransaction(async ({ transaction }) => {
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 700,
            status: LedgerEntryStatus.Posted,
            sourceUsageEventId: usageEventId,
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'posted',
              transaction
            )
          expect(balance).toBe(-1000)
        })
      })
      it('should correctly calculate the balance with a mix of posted credit and debit entries', async () => {
        await adminTransaction(async ({ transaction }) => {
          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entries: [
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 1200,
                status: LedgerEntryStatus.Posted,
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: 400,
                status: LedgerEntryStatus.Posted,
                sourceUsageEventId: usageEventId,
              },
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 100,
                status: LedgerEntryStatus.Posted,
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.PaymentRefunded,
                amount: 50,
                status: LedgerEntryStatus.Posted,
                sourceRefundId: refundId,
              },
            ],
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'posted',
              transaction
            )
          expect(balance).toBe(1200 - 400 + 100 - 50) // 850
        })
      })
      it('should ignore pending entries (both credit and debit)', async () => {
        await adminTransaction(async ({ transaction }) => {
          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entries: [
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 1000,
                status: LedgerEntryStatus.Posted,
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: 200,
                status: LedgerEntryStatus.Posted,
                sourceUsageEventId: usageEventId,
              },
              // Pending entries that should be ignored
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 500,
                status: LedgerEntryStatus.Pending,
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: 100,
                status: LedgerEntryStatus.Pending,
                sourceUsageEventId: usageEventId,
              },
            ],
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'posted',
              transaction
            )
          expect(balance).toBe(1000 - 200) // 800
        })
      })
      it('should ignore discarded entries (both posted and pending with discardedAt set in the past)', async () => {
        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          livemode: true,
          creditType: UsageCreditType.Grant,
          issuedAmount: 1000,
        })
        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday

        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: testLedgerTransaction.id,
          entries: [
            {
              // Posted, not discarded - should be included
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 1000,
              status: LedgerEntryStatus.Posted,
              discardedAt: null,
              sourceUsageCreditId: usageCreditId,
            },
            {
              // Posted, but discarded in the past - should be ignored
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 500,
              status: LedgerEntryStatus.Posted,
              discardedAt: pastDate,
              sourceUsageCreditId: usageCredit.id,
            },
            {
              // Pending, discarded in the past - should be ignored
              entryType: LedgerEntryType.UsageCost,
              amount: 200,
              status: LedgerEntryStatus.Pending,
              discardedAt: pastDate,
              sourceUsageEventId: usageEventId,
            },
          ],
        })
        const balance = await adminTransaction(
          async ({ transaction }) => {
            return await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'posted',
              transaction
            )
          }
        )
        expect(balance).toBe(1000)
      })
      it('should include posted entries with future discardedAt dates', async () => {
        const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000) // Tomorrow

        await setupCreditLedgerEntry({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: testLedgerTransaction.id,
          entryType: LedgerEntryType.CreditGrantRecognized,
          amount: 750,
          status: LedgerEntryStatus.Posted,
          discardedAt: futureDate,

          sourceUsageCreditId: usageCreditId,
        })
        const balance = await adminTransaction(
          async ({ transaction }) => {
            return await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'posted',
              transaction
            )
          }
        )
        expect(balance).toBe(750)
      })
      it('should only consider entries for the specified ledgerAccountId', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Entries for the main ledgerAccount
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 300,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 100,
            status: LedgerEntryStatus.Posted,
            sourceUsageEventId: usageEventId,
          })
          const secondSub = await setupSubscription({
            organizationId: organization.id,
            customerId: customer.id,
            livemode: true,
            paymentMethodId: paymentMethod.id,
            priceId: price.id,
          })
          // Setup another ledger account and its entries
          const otherLedgerAccount = await setupLedgerAccount({
            organizationId: organization.id,
            subscriptionId: secondSub.id, // Can be same or different subscription
            usageMeterId: usageMeter.id, // Can be same or different meter
            livemode: true,
          })
          const otherLedgerTransaction = await setupLedgerTransaction(
            {
              organizationId: organization.id,
              subscriptionId: secondSub.id,
              type: LedgerTransactionType.AdminCreditAdjusted,
            }
          )
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: secondSub.id,
            ledgerAccountId: otherLedgerAccount.id,
            ledgerTransactionId: otherLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 5000,
            status: LedgerEntryStatus.Posted,
            sourceUsageCreditId: usageCreditId,
          })

          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id }, // Calculate for the original ledgerAccount
              'posted',
              transaction
            )
          expect(balance).toBe(300 - 100) // 200
        })
      })
    })

    describe('balanceType: "pending" (as per current implementation: includes posted and (non-discarded) pending, credit and debit)', () => {
      it('should return 0 if no posted or non-discarded pending entries exist for the ledger account', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Setup a discarded pending entry
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 100,
            status: LedgerEntryStatus.Pending,
            discardedAt: new Date(Date.now() - 1000),
            sourceUsageCreditId: usageCreditId,
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'pending',
              transaction
            )
          expect(balance).toBe(0)
        })
      })
      it('should correctly sum amounts for posted credits and (non-discarded) pending credits', async () => {
        await adminTransaction(async ({ transaction }) => {
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 1000,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 500,
            status: LedgerEntryStatus.Pending, // Non-discarded pending credit
            sourceUsageCreditId: usageCreditId,
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'pending',
              transaction
            )
          expect(balance).toBe(1500)
        })
      })
      it('should correctly sum amounts for posted debits and (non-discarded) pending debits', async () => {
        await adminTransaction(async ({ transaction }) => {
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 700,
            status: LedgerEntryStatus.Posted,
            sourceUsageEventId: usageEventId,
          })
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 300,
            status: LedgerEntryStatus.Pending, // Non-discarded pending debit
            sourceUsageEventId: usageEventId,
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'pending',
              transaction
            )
          expect(balance).toBe(-1000)
        })
      })
      it('should correctly calculate the balance with a mix of posted and (non-discarded) pending entries (credits and debits)', async () => {
        await adminTransaction(async ({ transaction }) => {
          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entries: [
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 1200,
                status: LedgerEntryStatus.Posted,
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: 400,
                status: LedgerEntryStatus.Posted,
                sourceUsageEventId: usageEventId,
              },
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 100,
                status: LedgerEntryStatus.Pending,
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: 50,
                status: LedgerEntryStatus.Pending,
                sourceUsageEventId: usageEventId,
              },
            ],
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'pending',
              transaction
            )
          expect(balance).toBe(1200 - 400 + 100 - 50) // 850
        })
      })
      it('should ignore discarded pending entries', async () => {
        await adminTransaction(async ({ transaction }) => {
          const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entries: [
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 1000,
                status: LedgerEntryStatus.Posted,
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 500,
                status: LedgerEntryStatus.Pending,
                discardedAt: pastDate,
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: 200,
                status: LedgerEntryStatus.Pending,
                discardedAt: pastDate,
                sourceUsageEventId: usageEventId,
              },
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 300,
                status: LedgerEntryStatus.Pending,
                discardedAt: null,
                sourceUsageCreditId: usageCreditId,
              },
            ],
          })

          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'pending',
              transaction
            )
          expect(balance).toBe(1000 + 300) // 1300
        })
      })
      it('should only consider entries for the specified ledgerAccountId', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Entries for the main ledgerAccount
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 300,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 100,
            status: LedgerEntryStatus.Pending, // Pending for this account
            sourceUsageEventId: usageEventId,
          })

          const secondSub = await setupSubscription({
            organizationId: organization.id,
            customerId: customer.id,
            livemode: true,
            paymentMethodId: paymentMethod.id,
            priceId: price.id,
          })
          const otherLedgerAccount = await setupLedgerAccount({
            organizationId: organization.id,
            subscriptionId: secondSub.id,
            usageMeterId: usageMeter.id,
            livemode: true,
          })
          const otherLedgerTransaction = await setupLedgerTransaction(
            {
              organizationId: organization.id,
              subscriptionId: secondSub.id,
              type: LedgerTransactionType.AdminCreditAdjusted,
            }
          )
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: secondSub.id,
            ledgerAccountId: otherLedgerAccount.id,
            ledgerTransactionId: otherLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 5000,
            status: LedgerEntryStatus.Posted, // For other account

            sourceUsageCreditId: usageCreditId,
          })
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: secondSub.id,
            ledgerAccountId: otherLedgerAccount.id,
            ledgerTransactionId: otherLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 2000,
            status: LedgerEntryStatus.Pending, // Pending for other account
            sourceUsageEventId: usageEventId,
          })

          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id }, // Calculate for the original ledgerAccount
              'pending',
              transaction
            )
          expect(balance).toBe(300 - 100) // 200 (Posted credit - Pending debit for this account)
        })
      })
    })

    describe('balanceType: "available"', () => {
      it('should return 0 if no posted entries and no non-discarded pending debit entries exist', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Posted credit, but discarded
          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entries: [
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 100,
                status: LedgerEntryStatus.Posted,
                discardedAt: new Date(Date.now() - 1000),
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 200,
                status: LedgerEntryStatus.Pending,
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: 300,
                status: LedgerEntryStatus.Pending,
                discardedAt: new Date(Date.now() - 1000),
                sourceUsageEventId: usageEventId,
              },
            ],
          })

          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(0)
        })
      })

      it('should correctly calculate balance: (sum of posted credits) - (sum of posted debits) - (sum of non-discarded pending debits)', async () => {
        await adminTransaction(async ({ transaction }) => {
          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entries: [
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 1000,
                status: LedgerEntryStatus.Posted,
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.PaymentRefunded,
                amount: 200,
                status: LedgerEntryStatus.Posted,
                sourceRefundId: refundId,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: 300,
                status: LedgerEntryStatus.Pending,
                sourceUsageEventId: usageEventId,
              },
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 100,
                status: LedgerEntryStatus.Pending,
                sourceUsageCreditId: usageCreditId,
              },
            ],
          })

          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(1000 - 200 - 300) // 500
        })
      })

      it('should equal "posted" balance if there are no non-discarded pending debit entries', async () => {
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: testLedgerTransaction.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 500,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditId,
            },
            {
              entryType: LedgerEntryType.PaymentRefunded,
              amount: 100,
              status: LedgerEntryStatus.Posted,
              sourceRefundId: refundId,
            },
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 50,
              status: LedgerEntryStatus.Pending,
              sourceUsageCreditId: usageCreditId,
            },
            {
              entryType: LedgerEntryType.UsageCost,
              amount: 200,
              status: LedgerEntryStatus.Pending,
              discardedAt: new Date(Date.now() - 1000),
              sourceUsageEventId: usageEventId,
            },
          ],
        })
        await adminTransaction(async ({ transaction }) => {
          const availableBalance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          const postedBalance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'posted',
              transaction
            )
          expect(availableBalance).toBe(postedBalance)
          expect(availableBalance).toBe(500 - 100) // 400
        })
      })

      it('should include posted credit entries (adds to balance)', async () => {
        await adminTransaction(async ({ transaction }) => {
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 300,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(300)
        })
      })

      it('should include posted debit entries (subtracts from balance)', async () => {
        await adminTransaction(async ({ transaction }) => {
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 150,
            status: LedgerEntryStatus.Posted,
            sourceUsageEventId: usageEventId,
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(-150)
        })
      })

      it('should include non-discarded pending debit entries (subtracts from balance)', async () => {
        await adminTransaction(async ({ transaction }) => {
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 250,
            status: LedgerEntryStatus.Pending,
            sourceUsageEventId: usageEventId,
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(-250)
        })
      })

      it('should EXCLUDE non-discarded pending credit entries from the calculation', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Posted Credit: +100
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 100,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })
          // Non-discarded Pending Credit (should be ignored): +50
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 50,
            status: LedgerEntryStatus.Pending,
            sourceUsageCreditId: usageCreditId,
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(100)
        })
      })

      it('should ignore discarded pending debit entries', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Posted Credit: +200
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 200,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })
          // Discarded Pending Debit (should be ignored): -75
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 75,
            status: LedgerEntryStatus.Pending,
            discardedAt: new Date(Date.now() - 1000),
            sourceUsageEventId: usageEventId,
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(200)
        })
      })

      it('should ignore discarded pending credit entries', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Posted Credit: +300
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 300,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })
          // Discarded Pending Credit (should be ignored anyway by "available" logic for pending credits)
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 120,
            status: LedgerEntryStatus.Pending,
            discardedAt: new Date(Date.now() - 1000),
            sourceUsageCreditId: usageCreditId,
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(300)
        })
      })

      it('should handle a scenario with only posted credits and pending debits', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Posted Credit: +500
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 500,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })
          // Non-discarded Pending Debit: -150
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 150,
            status: LedgerEntryStatus.Pending,
            sourceUsageEventId: usageEventId,
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(500 - 150) // 350
        })
      })

      it('should handle a scenario with only posted debits and pending debits', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Posted Debit: -200
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.PaymentRefunded,
            amount: 200,
            status: LedgerEntryStatus.Posted,
            sourceRefundId: refundId,
          })
          // Non-discarded Pending Debit: -100
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 100,
            status: LedgerEntryStatus.Pending,
            sourceUsageEventId: usageEventId,
          })
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(-200 - 100) // -300
        })
      })

      it('should handle a scenario with posted credits, posted debits, pending debits, and pending credits (ignoring pending credits)', async () => {
        await adminTransaction(async ({ transaction }) => {
          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entries: [
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 1000,
                status: LedgerEntryStatus.Posted,
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.PaymentRefunded,
                amount: 200,
                status: LedgerEntryStatus.Posted,
                sourceRefundId: refundId,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: 300,
                status: LedgerEntryStatus.Pending,
                sourceUsageEventId: usageEventId,
              },
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 50,
                status: LedgerEntryStatus.Pending,
                sourceUsageCreditId: usageCreditId,
              },
            ],
          })

          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(1000 - 200 - 300) // 500
        })
      })

      it('should correctly calculate a negative available balance if pending debits exceed posted credits', async () => {
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: testLedgerTransaction.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 100,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditId,
            },
            {
              entryType: LedgerEntryType.UsageCost,
              amount: 250,
              status: LedgerEntryStatus.Pending,
              sourceUsageEventId: usageEventId,
            },
          ],
        })
        await adminTransaction(async ({ transaction }) => {
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(100 - 250) // -150
        })
      })

      it('should only consider entries for the specified ledgerAccountId', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Main account: Posted Credit +100, Pending Debit -50. Available = 50
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 100,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 50,
            status: LedgerEntryStatus.Pending,
            sourceUsageEventId: usageEventId,
          })

          const secondSub = await setupSubscription({
            organizationId: organization.id,
            customerId: customer.id,
            livemode: true,
            paymentMethodId: paymentMethod.id,
            priceId: price.id,
          })
          const otherLedgerAccount = await setupLedgerAccount({
            organizationId: organization.id,
            subscriptionId: secondSub.id,
            usageMeterId: usageMeter.id,
            livemode: true,
          })
          const otherLedgerTransaction = await setupLedgerTransaction(
            {
              organizationId: organization.id,
              subscriptionId: secondSub.id,
              type: LedgerTransactionType.AdminCreditAdjusted,
            }
          )
          // Other account: Posted Credit +1000, Pending Debit -200. Available = 800 (but should not affect main account)
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: secondSub.id,
            ledgerAccountId: otherLedgerAccount.id,
            ledgerTransactionId: otherLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 1000,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: secondSub.id,
            ledgerAccountId: otherLedgerAccount.id,
            ledgerTransactionId: otherLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 200,
            status: LedgerEntryStatus.Pending,
            sourceUsageEventId: usageEventId,
          })

          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id }, // Calculate for the original ledgerAccount
              'available',
              transaction
            )
          expect(balance).toBe(100 - 50) // 50
        })
      })
      it('should include entries with future discardedAt dates', async () => {
        await adminTransaction(async ({ transaction }) => {
          const futureDate = new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ) // Tomorrow
          // Posted Credit, future discard: +100
          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerTransactionId: testLedgerTransaction.id,
            ledgerAccountId: ledgerAccount.id,
            entries: [
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 100,
                status: LedgerEntryStatus.Posted,
                discardedAt: futureDate,
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: 50,
                status: LedgerEntryStatus.Pending,
                discardedAt: futureDate,
                sourceUsageEventId: usageEventId,
              },
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 20,
                status: LedgerEntryStatus.Pending,
                discardedAt: futureDate,
                sourceUsageCreditId: usageCreditId,
              },
            ],
          })

          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(100 - 50) // 50
        })
      })
    })

    describe('General for aggregateBalanceForLedgerAccountFromEntries (applicable to all balanceTypes)', () => {
      const balanceTypes: Array<'posted' | 'pending' | 'available'> =
        ['posted', 'pending', 'available']

      it('should correctly filter by ledgerAccountId, not including entries from other accounts', async () => {
        await adminTransaction(async ({ transaction }) => {
          const mainAccountEntryAmount = 100
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: mainAccountEntryAmount,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })

          const secondSub = await setupSubscription({
            organizationId: organization.id,
            customerId: customer.id,
            livemode: true,
            paymentMethodId: paymentMethod.id,
            priceId: price.id,
          })
          const otherLedgerAccount = await setupLedgerAccount({
            organizationId: organization.id,
            subscriptionId: secondSub.id,
            usageMeterId: usageMeter.id,
            livemode: true,
          })
          const otherLedgerTransaction = await setupLedgerTransaction(
            {
              organizationId: organization.id,
              subscriptionId: secondSub.id,
              type: LedgerTransactionType.AdminCreditAdjusted,
            }
          )
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: secondSub.id,
            ledgerAccountId: otherLedgerAccount.id,
            ledgerTransactionId: otherLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 5000,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })

          for (const type of balanceTypes) {
            const balance =
              await aggregateBalanceForLedgerAccountFromEntries(
                { ledgerAccountId: ledgerAccount.id },
                type,
                transaction
              )
            expect(balance).toBe(mainAccountEntryAmount) // Only the main account's entry should count
          }
        })
      })

      it('should correctly handle the discardedAt logic: ignore entries if discardedAt is not null and in the past', async () => {
        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          livemode: true,
          issuedAmount: 1000,
          creditType: UsageCreditType.Grant,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
        })
        await adminTransaction(async ({ transaction }) => {
          const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
          const includedAmount = 1000

          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entries: [
              {
                // This entry should always be included as its not discarded
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: includedAmount,
                status: LedgerEntryStatus.Posted,
                discardedAt: null,
                sourceUsageCreditId: usageCredit.id,
              },
              {
                // Discarded Posted Credit
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 500,
                status: LedgerEntryStatus.Posted,
                discardedAt: pastDate,
                sourceUsageCreditId: usageCredit.id,
              },
              {
                // Discarded Posted Debit
                entryType: LedgerEntryType.UsageCost,
                amount: 200,
                status: LedgerEntryStatus.Posted,
                discardedAt: pastDate,
                sourceUsageEventId: usageEventId,
              },
              {
                // Discarded Pending Credit
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 100,
                status: LedgerEntryStatus.Pending,
                discardedAt: pastDate,
                sourceUsageCreditId: usageCreditId,
              },
              {
                // Discarded Pending Debit
                entryType: LedgerEntryType.UsageCost,
                amount: 50,
                status: LedgerEntryStatus.Pending,
                discardedAt: pastDate,
                sourceUsageEventId: usageEventId,
              },
            ],
          })

          for (const type of balanceTypes) {
            const balance =
              await aggregateBalanceForLedgerAccountFromEntries(
                { ledgerAccountId: ledgerAccount.id },
                type,
                transaction
              )
            // Only the non-discarded posted credit should count for all types in this scenario
            expect(balance).toBe(includedAmount)
          }
        })
      })

      it('should correctly handle the discardedAt logic: include entries if discardedAt is null', async () => {
        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          livemode: true,
          issuedAmount: 1000,
          creditType: UsageCreditType.Grant,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
        })
        await adminTransaction(async ({ transaction }) => {
          const postedCreditAmount = 100
          const pendingDebitAmount = 50
          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entries: [
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: postedCreditAmount,
                status: LedgerEntryStatus.Posted,
                discardedAt: null,
                sourceUsageCreditId: usageCredit.id,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: pendingDebitAmount,
                status: LedgerEntryStatus.Pending,
                discardedAt: null,
                sourceUsageEventId: usageEventId,
              },
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 25,
                status: LedgerEntryStatus.Pending,
                discardedAt: null, // Pending credit
                sourceUsageCreditId: usageCreditId,
              },
            ],
          })
          for (const type of balanceTypes) {
            const balance =
              await aggregateBalanceForLedgerAccountFromEntries(
                { ledgerAccountId: ledgerAccount.id },
                type,
                transaction
              )
            if (type === 'posted') {
              expect(balance).toBe(postedCreditAmount) // 100
            } else if (type === 'pending') {
              expect(balance).toBe(
                postedCreditAmount - pendingDebitAmount + 25
              ) // 100 - 50 + 25 = 75
            } else {
              // available
              expect(balance).toBe(
                postedCreditAmount - pendingDebitAmount
              ) // 100 - 50 = 50 (pending credit ignored)
            }
          }
        })
      })

      it('should correctly handle the discardedAt logic: include entries if discardedAt is in the future', async () => {
        await adminTransaction(async ({ transaction }) => {
          const futureDate = new Date(
            Date.now() + 24 * 60 * 60 * 1000
          )
          const postedCreditAmount = 200
          const pendingDebitAmount = 75
          const usageCredit = await setupUsageCredit({
            organizationId: organization.id,
            livemode: true,
            issuedAmount: 1000,
            creditType: UsageCreditType.Grant,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
          })
          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entries: [
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: postedCreditAmount,
                status: LedgerEntryStatus.Posted,
                discardedAt: futureDate,
                sourceUsageCreditId: usageCredit.id,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: pendingDebitAmount,
                status: LedgerEntryStatus.Pending,
                discardedAt: futureDate,
                sourceUsageEventId: usageEventId,
              },
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 30,
                status: LedgerEntryStatus.Pending,
                discardedAt: futureDate,
                sourceUsageCreditId: usageCreditId,
              },
            ],
          })

          for (const type of balanceTypes) {
            const balance =
              await aggregateBalanceForLedgerAccountFromEntries(
                { ledgerAccountId: ledgerAccount.id },
                type,
                transaction
              )
            if (type === 'posted') {
              expect(balance).toBe(postedCreditAmount) // 200
            } else if (type === 'pending') {
              expect(balance).toBe(
                postedCreditAmount - pendingDebitAmount + 30
              ) // 200 - 75 + 30 = 155
            } else {
              // available
              expect(balance).toBe(
                postedCreditAmount - pendingDebitAmount
              ) // 200 - 75 = 125 (pending credit ignored)
            }
          }
        })
      })

      it('should handle an empty ledger (no entries at all for the account) and return 0', async () => {
        await adminTransaction(async ({ transaction }) => {
          for (const type of balanceTypes) {
            const balance =
              await aggregateBalanceForLedgerAccountFromEntries(
                { ledgerAccountId: ledgerAccount.id },
                type,
                transaction
              )
            expect(balance).toBe(0)
          }
        })
      })

      it('should handle entries with amount 0 correctly', async () => {
        const usageCredit = await setupUsageCredit({
          organizationId: organization.id,
          livemode: true,
          issuedAmount: 1000,
          creditType: UsageCreditType.Grant,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
        })
        const usageCreditApplication =
          await setupUsageCreditApplication({
            organizationId: organization.id,
            livemode: true,
            usageCreditId: usageCredit.id,
            amountApplied: 1000,
            usageEventId: usageEventId,
          })
        await adminTransaction(async ({ transaction }) => {
          const initialCreditAmount = 500
          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entries: [
              // Initial entry to have a non-zero balance
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: initialCreditAmount,
                status: LedgerEntryStatus.Posted,
                sourceUsageCreditId: usageCredit.id,
              },
              // Entries with amount 0
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 0,
                status: LedgerEntryStatus.Posted,
                sourceUsageCreditId: usageCredit.id,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: 0,
                status: LedgerEntryStatus.Posted,
                sourceUsageEventId: usageEventId,
              },
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: 0,
                status: LedgerEntryStatus.Pending,
                sourceUsageCreditId: usageCreditId,
              },
              {
                entryType: LedgerEntryType.UsageCost,
                amount: 0,
                status: LedgerEntryStatus.Pending,
                sourceUsageEventId: usageEventId,
              },
            ],
          })

          for (const type of balanceTypes) {
            const balance =
              await aggregateBalanceForLedgerAccountFromEntries(
                { ledgerAccountId: ledgerAccount.id },
                type,
                transaction
              )
            // The balance should remain the initial credit amount, as 0-amount entries don't change it.
            // For 'pending' and 'available', the pending 0-amount entries also don't change the logic for what *types* of entries are included.
            expect(balance).toBe(initialCreditAmount)
          }
        })
      })
    })
  })

  describe('aggregateAvailableBalanceForUsageCredit', () => {
    let testLedgerTransaction: LedgerTransaction.Record
    let usageCreditId1: string
    // We can add more usageCreditIds here if needed for other tests
    // let usageCreditId2: string;

    beforeEach(async () => {
      // organization, subscription, ledgerAccount, usageMeter are available from the outer scope

      testLedgerTransaction = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.AdminCreditAdjusted,
      })

      const usageCreditData1 = await setupUsageCredit({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        creditType: UsageCreditType.Grant,
        issuedAmount: 5000, // Arbitrary initial amount for the credit itself
        usageMeterId: usageMeter.id,
        livemode: true,
      })
      usageCreditId1 = usageCreditData1.id
    })

    // I. Basic Scenarios (Happy Paths)
    it('should return correct balance for a single usage credit ID with positive balance', async () => {
      const entryAmount1 = 1000
      const entryAmount2 = 500
      const totalExpectedBalance =
        entryAmount1 + entryAmount2 - entryAmount2
      const result = await adminTransaction(
        async ({ transaction }) => {
          await setupLedgerEntries({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerTransactionId: testLedgerTransaction.id,
            ledgerAccountId: ledgerAccount.id,
            entries: [
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: entryAmount1,
                status: LedgerEntryStatus.Posted,
                sourceUsageCreditId: usageCreditId1,
              },
              {
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: entryAmount2,
                status: LedgerEntryStatus.Posted,
                sourceUsageCreditId: usageCreditId1,
              },
              {
                entryType: LedgerEntryType.CreditGrantExpired, // This is a debit against the usage credit, representing the grant being 'used up' or 'expired' for this test's purpose.
                amount: entryAmount2,
                status: LedgerEntryStatus.Posted,
                sourceUsageCreditId: usageCreditId1,
              },
            ],
          })

          return aggregateAvailableBalanceForUsageCredit(
            {
              ledgerAccountId: ledgerAccount.id,
              sourceUsageCreditId: usageCreditId1,
            },
            transaction
          )
        }
      )
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        usageCreditId: usageCreditId1,
        balance: totalExpectedBalance,
        expiresAt: null,
        ledgerAccountId: ledgerAccount.id,
      })
    })

    it('should return correct balance for a single usage credit ID with zero balance', async () => {
      const amount = 2500
      await adminTransaction(async ({ transaction }) => {
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditId1,
            },
            {
              entryType: LedgerEntryType.CreditGrantExpired, // This is a debit against the usage credit
              amount,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditId1,
            },
          ],
        })

        const result = await aggregateAvailableBalanceForUsageCredit(
          {
            ledgerAccountId: ledgerAccount.id,
            sourceUsageCreditId: usageCreditId1,
          },
          transaction
        )

        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
          usageCreditId: usageCreditId1,
          balance: 0,
          expiresAt: null,
          ledgerAccountId: ledgerAccount.id,
        })
      })
    })

    it('should return correct balances for multiple distinct usage credit IDs', async () => {
      await adminTransaction(async ({ transaction }) => {
        // Setup three distinct usage credits
        const usageCreditA = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 10000, // Arbitrary initial amount
          usageMeterId: usageMeter.id,
          livemode: true,
        })
        const usageCreditB = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 10000,
          usageMeterId: usageMeter.id,
          livemode: true,
        })
        const usageCreditC = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 10000,
          usageMeterId: usageMeter.id,
          livemode: true,
        })

        // Entries for usageCreditA (Positive Balance: 1000 - 300 = 700)
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 1000,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditA.id,
            },
            {
              entryType: LedgerEntryType.CreditGrantExpired,
              amount: 300,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditA.id,
            },
          ],
        })

        // Entries for usageCreditB (Negative Balance: 500 - 800 = -300)
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 500,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditB.id,
            },
            {
              entryType: LedgerEntryType.CreditGrantExpired,
              amount: 800,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditB.id,
            },
          ],
        })

        // Entries for usageCreditC (Zero Balance: 200 - 200 = 0)
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 200,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditC.id,
            },
            {
              entryType: LedgerEntryType.CreditGrantExpired,
              amount: 200,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditC.id,
            },
          ],
        })

        const result = await aggregateAvailableBalanceForUsageCredit(
          {
            ledgerAccountId: ledgerAccount.id,
            // No sourceUsageCreditId specified, should return for all under the account
          },
          transaction
        )

        const expectedBalances = [
          {
            usageCreditId: usageCreditA.id,
            balance: 700,
            expiresAt: null,
            ledgerAccountId: ledgerAccount.id,
          },
          {
            usageCreditId: usageCreditB.id,
            balance: -300,
            expiresAt: null,
            ledgerAccountId: ledgerAccount.id,
          },
          {
            usageCreditId: usageCreditC.id,
            balance: 0,
            expiresAt: null,
            ledgerAccountId: ledgerAccount.id,
          },
        ].sort((x, y) =>
          x.usageCreditId.localeCompare(y.usageCreditId)
        )

        const sortedResult = result.sort((x, y) =>
          x.usageCreditId.localeCompare(y.usageCreditId)
        )

        expect(sortedResult).toHaveLength(3)
        expect(sortedResult).toEqual(expectedBalances)
      })
    })

    // II. Scenarios Testing "Available" Balance Logic
    it('should correctly calculate balance with posted credits and pending debits', async () => {
      // Setup:
      // - A sourceUsageCreditId has 'Posted' 'Credit' entries.
      // - The same sourceUsageCreditId also has 'Pending' 'Debit' entries (non-discarded).
      // Expected:
      // - Balance for this usageCreditId includes sum of 'Posted' 'Credit' minus sum of 'Pending' 'Debit'.
      await adminTransaction(async ({ transaction }) => {
        const postedCreditAmount = 2000
        const pendingDebitAmount = 500
        const expectedBalance =
          postedCreditAmount - pendingDebitAmount

        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: postedCreditAmount,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditId1,
            },
            {
              entryType: LedgerEntryType.CreditGrantExpired, // Represents a debit against the usage credit
              amount: pendingDebitAmount,
              status: LedgerEntryStatus.Pending, // Non-discarded pending debit
              sourceUsageCreditId: usageCreditId1,
            },
          ],
        })

        const result = await aggregateAvailableBalanceForUsageCredit(
          {
            ledgerAccountId: ledgerAccount.id,
            sourceUsageCreditId: usageCreditId1,
          },
          transaction
        )

        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
          usageCreditId: usageCreditId1,
          balance: expectedBalance,
          expiresAt: null,
          ledgerAccountId: ledgerAccount.id,
        })
      })
    })

    it('should ignore pending credits when calculating available balance', async () => {
      // Setup:
      // - A sourceUsageCreditId has 'Posted' 'Credit' entries.
      // - The same sourceUsageCreditId also has 'Pending' 'Credit' entries (non-discarded).
      // Expected:
      // - Balance for this usageCreditId only reflects 'Posted' 'Credit' amounts; 'Pending' 'Credit' amounts are ignored.
      await adminTransaction(async ({ transaction }) => {
        const postedCreditAmount = 3000
        const pendingCreditAmount = 1000 // This should be ignored

        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: postedCreditAmount,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditId1,
            },
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: pendingCreditAmount,
              status: LedgerEntryStatus.Pending, // Non-discarded pending credit
              sourceUsageCreditId: usageCreditId1,
            },
          ],
        })

        const result = await aggregateAvailableBalanceForUsageCredit(
          {
            ledgerAccountId: ledgerAccount.id,
            sourceUsageCreditId: usageCreditId1,
          },
          transaction
        )

        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
          usageCreditId: usageCreditId1,
          balance: postedCreditAmount, // Only posted credit should count
          expiresAt: null,
          ledgerAccountId: ledgerAccount.id,
        })
      })
    })

    it('should correctly calculate available balance with mixed statuses for a single usage credit ID', async () => {
      // Setup:
      // - A sourceUsageCreditId has:
      //   - 'Posted' 'Credit'
      //   - 'Posted' 'Debit'
      //   - 'Pending' 'Debit' (non-discarded, should be included)
      //   - 'Pending' 'Credit' (non-discarded, should be excluded)
      // Expected:
      // - Balance for this usageCreditId accurately reflects the sum according to "available" logic.
      await adminTransaction(async ({ transaction }) => {
        const postedCreditAmount = 5000
        const postedDebitAmount = 1000
        const pendingDebitAmount = 500
        const pendingCreditAmount = 2000 // Should be excluded

        const expectedBalance =
          postedCreditAmount - postedDebitAmount - pendingDebitAmount

        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: postedCreditAmount,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditId1,
            },
            {
              entryType: LedgerEntryType.CreditGrantExpired,
              amount: postedDebitAmount,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditId1,
            },
            {
              entryType: LedgerEntryType.CreditGrantExpired,
              amount: pendingDebitAmount,
              status: LedgerEntryStatus.Pending, // Non-discarded pending debit
              sourceUsageCreditId: usageCreditId1,
            },
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: pendingCreditAmount,
              status: LedgerEntryStatus.Pending, // Non-discarded pending credit (should be excluded)
              sourceUsageCreditId: usageCreditId1,
            },
          ],
        })

        const result = await aggregateAvailableBalanceForUsageCredit(
          {
            ledgerAccountId: ledgerAccount.id,
            sourceUsageCreditId: usageCreditId1,
          },
          transaction
        )

        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
          usageCreditId: usageCreditId1,
          balance: expectedBalance,
          expiresAt: null,
          ledgerAccountId: ledgerAccount.id,
        })
      })
    })

    // // III. Scenarios Testing discardedAt Filter

    // IV. Edge Cases and Empty Results
    it('should return an empty array if no ledger entries exist for the account', async () => {
      // Setup:
      // - The specified ledgerAccountId has no entries in the ledgerEntries table.
      // Expected:
      // - Empty array.
      await adminTransaction(async ({ transaction }) => {
        const result = await aggregateAvailableBalanceForUsageCredit(
          { ledgerAccountId: ledgerAccount.id },
          transaction
        )
        expect(result).toEqual([])
      })
    })

    it('should return an empty array if entries exist for the account but none have a sourceUsageCreditId', async () => {
      // Setup:
      // - Entries exist for the ledgerAccountId, but none of them have a sourceUsageCreditId (all are null).
      // Expected:
      // - Empty array.
      const usageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 1000,
        priceId: price.id,
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        transactionId: testLedgerTransaction.id,
        livemode: true,
      })
      await adminTransaction(async ({ transaction }) => {
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id, // Assuming adjustments can be linked to a subscription
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              entryType: LedgerEntryType.UsageCost,
              amount: 1000,
              status: LedgerEntryStatus.Posted,
              sourceUsageEventId: usageEvent.id,
            },
          ],
        })

        const result = await aggregateAvailableBalanceForUsageCredit(
          { ledgerAccountId: ledgerAccount.id }, // Query for the account
          transaction
        )
        expect(result).toEqual([])
      })
    })

    it('should return an empty array if entries with sourceUsageCreditId exist but none match "available" or non-discarded criteria for any credit ID', async () => {
      // Setup:
      // - Entries for a sourceUsageCreditId are all 'Pending' 'Credit', or all discarded.
      // - This applies to all sourceUsageCreditIds present for the account.
      // Expected:
      // - Empty array (no usageCreditId should appear in results).
      await adminTransaction(async ({ transaction }) => {
        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday

        // Create two distinct usage credits
        const usageCreditAlpha = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 10000,
          usageMeterId: usageMeter.id,
          livemode: true,
        })
        const usageCreditBeta = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 10000,
          usageMeterId: usageMeter.id,
          livemode: true,
        })

        // Entries for usageCreditAlpha - none should qualify for available balance
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              // Pending Credit - ignored by available balance
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 1000,
              status: LedgerEntryStatus.Pending,
              sourceUsageCreditId: usageCreditAlpha.id,
            },
            {
              // Posted Debit, but discarded - ignored
              entryType: LedgerEntryType.CreditGrantExpired,
              amount: 500,
              status: LedgerEntryStatus.Posted,
              discardedAt: pastDate,
              sourceUsageCreditId: usageCreditAlpha.id,
            },
          ],
        })

        // Entries for usageCreditBeta - none should qualify for available balance
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              // Posted Credit, but discarded - ignored
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 2000,
              status: LedgerEntryStatus.Posted,
              discardedAt: pastDate,
              sourceUsageCreditId: usageCreditBeta.id,
            },
            {
              // Pending Debit, but discarded - ignored
              entryType: LedgerEntryType.CreditGrantExpired,
              amount: 700,
              status: LedgerEntryStatus.Pending,
              discardedAt: pastDate,
              sourceUsageCreditId: usageCreditBeta.id,
            },
          ],
        })

        const result = await aggregateAvailableBalanceForUsageCredit(
          { ledgerAccountId: ledgerAccount.id }, // Query for the whole account
          transaction
        )

        expect(result).toEqual([])
      })
    })

    // // V. Scenarios Testing scopedWhere Specificity (ledgerAccountId)
    it('should only consider entries for the specified ledgerAccountId in scopedWhere', async () => {
      // Setup:
      // - Data includes entries for ledgerAccountId_A (the one being tested) and ledgerAccountId_B.
      // - Both accounts have entries linked to a common sourceUsageCreditId.
      // Expected:
      // - Results when querying for ledgerAccountId_A only include balances derived from its entries.
      // - The balance for the common sourceUsageCreditId should only reflect entries from ledgerAccountId_A.
      await adminTransaction(async ({ transaction }) => {
        // ledgerAccountA is the `ledgerAccount` from beforeEach
        const ledgerAccountA = ledgerAccount

        // 1. Set up a second Subscription
        const secondSubscription = await setupSubscription({
          organizationId: organization.id,
          customerId: customer.id,
          paymentMethodId: paymentMethod.id,
          priceId: price.id,
          status: SubscriptionStatus.Active,
          livemode: true,
        })

        // 2. Set up a second Usage Meter
        const secondUsageMeter = await setupUsageMeter({
          organizationId: organization.id,
          name: 'Second Test Usage Meter',
          catalogId: catalog.id, // Assuming catalog can be shared or is appropriate
          livemode: true,
        })

        // 3. Set up a second Ledger Account (ledgerAccountB)
        const ledgerAccountB = await setupLedgerAccount({
          organizationId: organization.id,
          subscriptionId: secondSubscription.id,
          usageMeterId: secondUsageMeter.id,
          livemode: true,
        })

        // 4. Set up a common Usage Credit (linked to the primary subscription for simplicity)
        const commonUsageCredit = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id, // Associated with the first subscription
          creditType: UsageCreditType.Grant,
          issuedAmount: 10000, // Arbitrary initial amount for the credit itself
          usageMeterId: usageMeter.id, // Associated with the first usage meter
          livemode: true,
        })

        // 5. Set up a second Ledger Transaction for the second subscription
        const secondLedgerTransaction = await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: secondSubscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted, // Or any suitable type
        })

        // 6. Create Ledger Entries
        const amountA = 1000 // Amount for ledgerAccountA
        const amountB = 5000 // Amount for ledgerAccountB (should be ignored in the query)

        // Entry for ledgerAccountA
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id, // Uses primary subscription
          ledgerTransactionId: testLedgerTransaction.id, // Uses primary ledger transaction
          ledgerAccountId: ledgerAccountA.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: amountA,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: commonUsageCredit.id,
            },
          ],
        })

        // Entry for ledgerAccountB (for the *same* commonUsageCredit)
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: secondSubscription.id, // Uses second subscription
          ledgerTransactionId: secondLedgerTransaction.id, // Uses second ledger transaction
          ledgerAccountId: ledgerAccountB.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: amountB,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: commonUsageCredit.id,
            },
          ],
        })

        // 7. Execute the Test - Query for ledgerAccountA and the commonUsageCreditId
        const result = await aggregateAvailableBalanceForUsageCredit(
          {
            ledgerAccountId: ledgerAccountA.id,
            sourceUsageCreditId: commonUsageCredit.id,
          },
          transaction
        )

        // 8. Assert Results
        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
          usageCreditId: commonUsageCredit.id,
          balance: amountA, // Should only be the amount from ledgerAccountA's entry
          expiresAt: null,
          ledgerAccountId: ledgerAccount.id,
        })
      })
    })

    // VI. Data Integrity
    it('should handle entries with amount 0 correctly, not affecting balance sums but processed without error', async () => {
      // Setup:
      // - A sourceUsageCreditId has 'Posted' 'Credit' of 100.
      // - The same sourceUsageCreditId also has 'Posted' 'Credit' of 0.
      // - And a 'Pending' 'Debit' of 0.
      // Expected:
      // - Balance for this usageCreditId should be 100 (0 amount entries don't change the sum but are processed).
      await adminTransaction(async ({ transaction }) => {
        const initialPostedCreditAmount = 100
        const expectedBalance = initialPostedCreditAmount // Since other amounts are 0

        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: initialPostedCreditAmount,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditId1,
            },
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 0, // Posted credit with 0 amount
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditId1,
            },
            {
              entryType: LedgerEntryType.CreditGrantExpired, // Represents a debit
              amount: 0, // Pending debit with 0 amount
              status: LedgerEntryStatus.Pending,
              sourceUsageCreditId: usageCreditId1,
            },
          ],
        })

        const result = await aggregateAvailableBalanceForUsageCredit(
          {
            ledgerAccountId: ledgerAccount.id,
            sourceUsageCreditId: usageCreditId1,
          },
          transaction
        )

        expect(result).toHaveLength(1)
        expect(result[0]).toEqual({
          usageCreditId: usageCreditId1,
          balance: expectedBalance,
          expiresAt: null,
          ledgerAccountId: ledgerAccount.id,
        })
      })
    })

    it('should correctly handle multiple usage credits where some have no "available" entries that qualify', async () => {
      // Setup:
      // - sourceUsageCreditId_A has available entries leading to a positive balance.
      // - sourceUsageCreditId_B has entries, but they are all 'Pending' 'Credit' or discarded.
      // - sourceUsageCreditId_C has available entries leading to a negative balance.
      // Expected:
      // - Array containing balances for sourceUsageCreditId_A and sourceUsageCreditId_C.
      // - sourceUsageCreditId_B should not be in the result array.
      await adminTransaction(async ({ transaction }) => {
        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday

        // 1. Set up Three Usage Credits
        const usageCreditA = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 10000,
          usageMeterId: usageMeter.id,
          livemode: true,
        })
        const usageCreditB = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 10000,
          usageMeterId: usageMeter.id,
          livemode: true,
        })
        const usageCreditC = await setupUsageCredit({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          creditType: UsageCreditType.Grant,
          issuedAmount: 10000,
          usageMeterId: usageMeter.id,
          livemode: true,
        })

        // 2. Define Expected Balances
        const expectedBalanceA = 1000 - 200 - 100 // Should be 700
        const expectedBalanceC = 300 - 600 - 100 // Should be -400

        // 3. Ledger Entries for usageCreditA (Positive Balance)
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 1000,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditA.id,
            },
            {
              entryType: LedgerEntryType.CreditGrantExpired,
              amount: 200,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditA.id,
            }, // Debit
            {
              entryType: LedgerEntryType.CreditGrantExpired,
              amount: 100,
              status: LedgerEntryStatus.Pending,
              sourceUsageCreditId: usageCreditA.id,
            }, // Debit
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 50,
              status: LedgerEntryStatus.Pending,
              sourceUsageCreditId: usageCreditA.id,
            }, // Pending Credit (ignored)
          ],
        })

        // 4. Ledger Entries for usageCreditB (No Qualifying Entries)
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 500,
              status: LedgerEntryStatus.Pending,
              sourceUsageCreditId: usageCreditB.id,
            }, // Pending Credit (ignored)
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 300,
              status: LedgerEntryStatus.Posted,
              discardedAt: pastDate,
              sourceUsageCreditId: usageCreditB.id,
            }, // Discarded Posted Credit (ignored)
            {
              entryType: LedgerEntryType.CreditGrantExpired,
              amount: 100,
              status: LedgerEntryStatus.Pending,
              discardedAt: pastDate,
              sourceUsageCreditId: usageCreditB.id,
            }, // Discarded Pending Debit (ignored)
          ],
        })

        // 5. Ledger Entries for usageCreditC (Negative Balance)
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: testLedgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          entries: [
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: 300,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditC.id,
            },
            {
              entryType: LedgerEntryType.CreditGrantExpired,
              amount: 600,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCreditC.id,
            }, // Debit
            {
              entryType: LedgerEntryType.CreditGrantExpired,
              amount: 100,
              status: LedgerEntryStatus.Pending,
              sourceUsageCreditId: usageCreditC.id,
            }, // Debit
          ],
        })

        // 6. Execute the Test
        const result = await aggregateAvailableBalanceForUsageCredit(
          { ledgerAccountId: ledgerAccount.id }, // Query for the whole account
          transaction
        )

        // 7. Assert Results
        expect(result).toHaveLength(2)
        expect(result).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              usageCreditId: usageCreditA.id,
              balance: expectedBalanceA,
            }),
            expect.objectContaining({
              usageCreditId: usageCreditC.id,
              balance: expectedBalanceC,
            }),
          ])
        )
        // Ensure usageCreditB is not present
        expect(
          result.find(
            (item) => item.usageCreditId === usageCreditB.id
          )
        ).toBeUndefined()
      })
    })
  })
})
