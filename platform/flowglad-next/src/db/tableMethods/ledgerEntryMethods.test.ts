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
} from './ledgerEntryMethods'
import { ledgerEntryNulledSourceIdColumns } from '../schema/ledgerEntries'

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
      await adminTransaction(async ({ transaction }) => {
        const localLedgerTransaction = await setupLedgerTransaction({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.AdminCreditAdjusted,
        })
        const entryData = {
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
        const entryData1 = {
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
        }
        const entryData2 = {
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          ledgerTransactionId: localLedgerTransaction.id,
          entryType: LedgerEntryType.CreditGrantRecognized,
          direction: LedgerEntryDirection.Credit,
          amount: 50,
          status: LedgerEntryStatus.Posted,
          livemode: true,
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
        const entryData1 = {
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
        }
        const entryData2 = {
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
        const entryData = {
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
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 1200,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 400,
            status: LedgerEntryStatus.Posted,
            sourceUsageEventId: usageEventId,
          })
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
            entryType: LedgerEntryType.PaymentRefunded,
            amount: 50,
            status: LedgerEntryStatus.Posted,
            sourceRefundId: refundId,
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
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 200,
            status: LedgerEntryStatus.Posted,
            sourceUsageEventId: usageEventId,
          })
          // Pending entries that should be ignored
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 500,
            status: LedgerEntryStatus.Pending,
            sourceUsageCreditId: usageCreditId,
          })
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
        await adminTransaction(async ({ transaction }) => {
          const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000) // Yesterday

          // Posted, not discarded - should be included
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 1000,
            status: LedgerEntryStatus.Posted,
            discardedAt: null,

            sourceUsageCreditId: usageCreditId,
          })

          // Posted, but discarded in the past - should be ignored
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 500,
            status: LedgerEntryStatus.Posted,
            discardedAt: pastDate,
            sourceUsageCreditId: usageCredit.id,
          })
          // Pending, discarded in the past - should be ignored
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 200,
            status: LedgerEntryStatus.Pending,
            discardedAt: pastDate,
            sourceUsageEventId: usageEventId,
          })

          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'posted',
              transaction
            )
          expect(balance).toBe(1000)
        })
      })
      it('should include posted entries with future discardedAt dates', async () => {
        await adminTransaction(async ({ transaction }) => {
          const futureDate = new Date(
            Date.now() + 24 * 60 * 60 * 1000
          ) // Tomorrow

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

          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'posted',
              transaction
            )
          expect(balance).toBe(750)
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
          // Posted Credit
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 1200,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCreditId,
          })
          // Posted Debit
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 400,
            status: LedgerEntryStatus.Posted,
            sourceUsageEventId: usageEventId,
          })
          // Pending Credit (non-discarded)
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
          // Pending Debit (non-discarded)
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
          // Posted Credit (should be included)
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
          // Pending Credit, discarded (should be ignored)
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 500,
            status: LedgerEntryStatus.Pending,
            discardedAt: pastDate,
            sourceUsageCreditId: usageCreditId,
          })
          // Pending Debit, discarded (should be ignored)
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 200,
            status: LedgerEntryStatus.Pending,
            discardedAt: pastDate,
            sourceUsageEventId: usageEventId,
          })
          // Pending Credit, not discarded (should be included)
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 300,
            status: LedgerEntryStatus.Pending,
            discardedAt: null, // or future date
            sourceUsageCreditId: usageCreditId,
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
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 100,
            status: LedgerEntryStatus.Posted,
            discardedAt: new Date(Date.now() - 1000),

            sourceUsageCreditId: usageCreditId,
          })
          // Pending credit (ignored for available)
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 200,
            status: LedgerEntryStatus.Pending,
            sourceUsageCreditId: usageCreditId,
          })
          // Pending debit, but discarded
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 300,
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
          expect(balance).toBe(0)
        })
      })

      it('should correctly calculate balance: (sum of posted credits) - (sum of posted debits) - (sum of non-discarded pending debits)', async () => {
        await adminTransaction(async ({ transaction }) => {
          // Posted Credit: +1000
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
          // Non-discarded Pending Debit: -300
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 300,
            status: LedgerEntryStatus.Pending,
            sourceUsageEventId: usageEventId,
          })
          // Non-discarded Pending Credit (should be ignored): +100 (ignored)
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
          // Posted Debit: -100
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.PaymentRefunded,
            amount: 100,
            status: LedgerEntryStatus.Posted,
            sourceRefundId: refundId,
          })
          // Pending Credit (ignored for available)
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
          // Discarded Pending Debit (ignored)
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 200,
            status: LedgerEntryStatus.Pending,
            discardedAt: new Date(Date.now() - 1000),
            sourceUsageEventId: usageEventId,
          })

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
          // Posted Credit: +1000
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
          // Non-discarded Pending Debit: -300
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 300,
            status: LedgerEntryStatus.Pending,
            sourceUsageEventId: usageEventId,
          })
          // Non-discarded Pending Credit (ignored): +50
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
          expect(balance).toBe(1000 - 200 - 300) // 500
        })
      })

      it('should correctly calculate a negative available balance if pending debits exceed posted credits', async () => {
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
          // Non-discarded Pending Debit: -250
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
              { ledgerAccountId: ledgerAccount.id },
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
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 100,
            status: LedgerEntryStatus.Posted,

            discardedAt: futureDate,
            sourceUsageCreditId: usageCreditId,
          })
          // Pending Debit, future discard: -50
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 50,
            status: LedgerEntryStatus.Pending,
            discardedAt: futureDate,
            sourceUsageEventId: usageEventId,
          })
          // Pending Credit, future discard (ignored anyway for available): +20
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 20,
            status: LedgerEntryStatus.Pending,
            discardedAt: futureDate,
            sourceUsageCreditId: usageCreditId,
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
        const usageCreditApplication =
          await setupUsageCreditApplication({
            organizationId: organization.id,
            livemode: true,
            usageCreditId: usageCredit.id,
            amountApplied: 1000,
          })
        await adminTransaction(async ({ transaction }) => {
          const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
          const includedAmount = 1000

          // This entry should always be included as its not discarded
          await setupCreditLedgerEntry({
            ...ledgerEntryNulledSourceIdColumns,
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: includedAmount,
            status: LedgerEntryStatus.Posted,
            discardedAt: null,

            sourceUsageCreditId: usageCredit.id,
          })

          // These discarded entries should be ignored by all balance types
          await setupCreditLedgerEntry({
            // Discarded Posted Credit
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 500,
            status: LedgerEntryStatus.Posted,
            discardedAt: pastDate,
            sourceUsageCreditId: usageCredit.id,
          })
          await setupDebitLedgerEntry({
            // Discarded Posted Debit
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 200,
            status: LedgerEntryStatus.Posted,
            discardedAt: pastDate,
            sourceUsageEventId: usageEventId,
          })
          await setupCreditLedgerEntry({
            // Discarded Pending Credit
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 100,
            status: LedgerEntryStatus.Pending,
            discardedAt: pastDate,
            sourceUsageCreditId: usageCreditId,
          })
          await setupDebitLedgerEntry({
            // Discarded Pending Debit
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 50,
            status: LedgerEntryStatus.Pending,
            discardedAt: pastDate,
            sourceUsageEventId: usageEventId,
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
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: postedCreditAmount,
            status: LedgerEntryStatus.Posted,
            discardedAt: null,

            sourceUsageCreditId: usageCredit.id,
          })
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: pendingDebitAmount,
            status: LedgerEntryStatus.Pending,
            discardedAt: null,
            sourceUsageEventId: usageEventId,
          })
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 25,
            status: LedgerEntryStatus.Pending,
            discardedAt: null, // Pending credit
            sourceUsageCreditId: usageCreditId,
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
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: postedCreditAmount,
            status: LedgerEntryStatus.Posted,
            discardedAt: futureDate,

            sourceUsageCreditId: usageCredit.id,
          })
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: pendingDebitAmount,
            status: LedgerEntryStatus.Pending,
            discardedAt: futureDate,
            sourceUsageEventId: usageEventId,
          })
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 30,
            status: LedgerEntryStatus.Pending,
            discardedAt: futureDate, // Pending credit
            sourceUsageCreditId: usageCreditId,
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
          })
        await adminTransaction(async ({ transaction }) => {
          const initialCreditAmount = 500
          // Initial entry to have a non-zero balance
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: initialCreditAmount,
            status: LedgerEntryStatus.Posted,

            sourceUsageCreditId: usageCredit.id,
          })

          // Entries with amount 0
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 0,
            status: LedgerEntryStatus.Posted,
            sourceUsageCreditId: usageCredit.id,
          })
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 0,
            status: LedgerEntryStatus.Posted,
            sourceUsageEventId: usageEventId,
          })
          await setupCreditLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: 0,
            status: LedgerEntryStatus.Pending,
            sourceUsageCreditId: usageCreditId,
          })
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerAccountId: ledgerAccount.id,
            ledgerTransactionId: testLedgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: 0,
            status: LedgerEntryStatus.Pending,
            sourceUsageEventId: usageEventId,
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
})
