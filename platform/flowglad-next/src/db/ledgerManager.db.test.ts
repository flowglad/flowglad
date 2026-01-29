import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import {
  setupBillingPeriod,
  setupCreditLedgerEntry,
  setupCustomer,
  setupDebitLedgerEntry,
  setupLedgerAccount,
  setupLedgerEntries,
  setupLedgerTransaction,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
  setupUsageCredit,
  setupUsageEvent,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Customer } from '@/db/schema/customers'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import type { LedgerAccount } from '@/db/schema/ledgerAccounts'
import type { LedgerEntry } from '@/db/schema/ledgerEntries'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { Refund } from '@/db/schema/refunds'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageCreditBalanceAdjustment } from '@/db/schema/usageCreditBalanceAdjustments'
import type { UsageCredit } from '@/db/schema/usageCredits'
import type { UsageEvent } from '@/db/schema/usageEvents'
import type { UsageMeter } from '@/db/schema/usageMeters'
import {
  BillingPeriodStatus,
  CurrencyCode,
  InvoiceStatus,
  InvoiceType,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionInitiatingSourceType,
  LedgerTransactionType,
  PaymentMethodType,
  RefundStatus,
  SubscriptionItemType,
  SubscriptionStatus,
  UsageCreditSourceReferenceType,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'
import { core } from '@/utils/core'
import {
  extractLedgerManagerIdempotencyKey,
  processLedgerCommand,
} from './ledgerManager/ledgerManager'
import {
  type AdminCreditAdjustedLedgerCommand,
  type BillingPeriodTransitionLedgerCommand,
  type CreditGrantExpiredLedgerCommand,
  type CreditGrantRecognizedLedgerCommand,
  type PaymentRefundedLedgerCommand,
  PaymentRefundedLedgerCommandAdjustmentBehavior,
  type SettleInvoiceUsageCostsLedgerCommand,
  type UsageEventProcessedLedgerCommand,
} from './ledgerManager/ledgerManagerTypes'
import { aggregateBalanceForLedgerAccountFromEntries } from './tableMethods/ledgerEntryMethods'

describe('Ledger Management System', async () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let price: Price.Record
  let customer: Customer.Record
  let paymentMethod: PaymentMethod.Record
  let subscription: Subscription.Record
  let usageMeter: UsageMeter.Record
  let billingPeriod: BillingPeriod.Record
  let ledgerAccount: LedgerAccount.Record

  beforeEach(async () => {
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    price = orgData.price
    pricingModel = orgData.pricingModel
    product = orgData.product

    customer = (
      await setupCustomer({
        organizationId: organization.id,
        email: `customer+${core.nanoid()}@test.com`,
        livemode: true,
      })
    ).unwrap()

    paymentMethod = (
      await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        type: PaymentMethodType.Card,
        livemode: true,
      })
    ).unwrap()

    usageMeter = (
      await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter',
        pricingModelId: pricingModel.id,
        livemode: true,
      })
    ).unwrap()

    subscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      status: SubscriptionStatus.Active,
      currentBillingPeriodStart:
        Date.now() - 30 * 24 * 60 * 60 * 1000,
      currentBillingPeriodEnd: Date.now() + 1 * 24 * 60 * 60 * 1000,
      livemode: true,
    })

    billingPeriod = await setupBillingPeriod({
      subscriptionId: subscription.id,
      startDate: subscription.currentBillingPeriodStart!,
      endDate: subscription.currentBillingPeriodEnd!,
      livemode: subscription.livemode,
    })

    ledgerAccount = (
      await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        livemode: subscription.livemode,
      })
    ).unwrap()
  })

  describe('I. Core Ledger & System-Wide Properties', () => {
    describe('1. Balance Integrity & Accuracy', () => {
      it('should accurately reflect the "posted" financial balance from posted LedgerEntries', async () => {
        const coreParams = {
          organizationId: organization.id,
          livemode: subscription.livemode,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.UsageEventProcessed,
        }
        const ledgerTransaction = (
          await setupLedgerTransaction(coreParams)
        ).unwrap()

        const entry1Amount = -1000
        const entry2Amount = 200
        const entry3Amount = -50
        const usageEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          priceId: price.id,
          billingPeriodId: billingPeriod.id,
          transactionId: core.nanoid(),
          customerId: customer.id,
          amount: 100,
        })
        ;(
          await setupDebitLedgerEntry({
            ...coreParams,
            ledgerTransactionId: ledgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: usageEvent.amount,
            status: LedgerEntryStatus.Posted,
            ledgerAccountId: ledgerAccount.id,
            sourceUsageEventId: usageEvent.id,
            usageMeterId: usageMeter.id,
          })
        ).unwrap()
        const usageCredit = (
          await setupUsageCredit({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            issuedAmount: 100,
            livemode: subscription.livemode,
            creditType: UsageCreditType.Payment,
          })
        ).unwrap()
        ;(
          await setupCreditLedgerEntry({
            ...coreParams,
            ledgerTransactionId: ledgerTransaction.id,
            entryType: LedgerEntryType.CreditGrantRecognized,
            amount: usageCredit.issuedAmount,
            status: LedgerEntryStatus.Posted,
            ledgerAccountId: ledgerAccount.id,
            sourceUsageCreditId: usageCredit.id,
            usageMeterId: usageMeter.id,
          })
        ).unwrap()
        const secondUsageEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          amount: 100,
          priceId: price.id,
          billingPeriodId: billingPeriod.id,
          transactionId: core.nanoid(),
          customerId: customer.id,
        })
        ;(
          await setupDebitLedgerEntry({
            ...coreParams,
            ledgerTransactionId: ledgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: secondUsageEvent.amount,
            status: LedgerEntryStatus.Posted,
            ledgerAccountId: ledgerAccount.id,
            sourceUsageEventId: secondUsageEvent.id,
            usageMeterId: usageMeter.id,
          })
        ).unwrap()
        const thirdUsageEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          amount: 100,
          priceId: price.id,
          billingPeriodId: billingPeriod.id,
          transactionId: core.nanoid(),
          customerId: customer.id,
        })
        ;(
          await setupDebitLedgerEntry({
            ...coreParams,
            ledgerTransactionId: ledgerTransaction.id,
            entryType: LedgerEntryType.UsageCost,
            amount: thirdUsageEvent.amount,
            status: LedgerEntryStatus.Pending,
            ledgerAccountId: ledgerAccount.id,
            sourceUsageEventId: thirdUsageEvent.id,
            usageMeterId: usageMeter.id,
          })
        ).unwrap()

        const expectedBalance =
          usageCredit.issuedAmount -
          usageEvent.amount -
          secondUsageEvent.amount // omit thirdUsageEvent, which is pending

        const result = (
          await adminTransaction(async ({ transaction }) => {
            return Result.ok(
              await aggregateBalanceForLedgerAccountFromEntries(
                { ledgerAccountId: ledgerAccount.id },
                'posted',
                transaction
              )
            )
          })
        ).unwrap()
        expect(result).toBe(expectedBalance)
      })
      it('should accurately reflect the "effective/pending" balance from posted or active pending LedgerEntries', async () => {
        const coreParams = {
          organizationId: organization.id,
          livemode: subscription.livemode,
          subscriptionId: subscription.id,
          type: LedgerTransactionType.UsageEventProcessed,
        }
        const ledgerTransaction = (
          await setupLedgerTransaction(coreParams)
        ).unwrap()

        const usageEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          amount: 100,
          priceId: price.id,
          billingPeriodId: billingPeriod.id,
          transactionId: core.nanoid(),
          customerId: customer.id,
          properties: {},
        })
        const usageCredit = (
          await setupUsageCredit({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            issuedAmount: 100,
            livemode: subscription.livemode,
            creditType: UsageCreditType.Payment,
          })
        ).unwrap()
        const secondUsageEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          amount: 100,
          priceId: price.id,
          billingPeriodId: billingPeriod.id,
          transactionId: core.nanoid(),
          customerId: customer.id,
          properties: {},
        })
        const thirdUsageEvent = await setupUsageEvent({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          usageMeterId: usageMeter.id,
          amount: 100,
          priceId: price.id,
          billingPeriodId: billingPeriod.id,
          transactionId: core.nanoid(),
          customerId: customer.id,
          properties: {},
        })
        await setupLedgerEntries({
          organizationId: organization.id,
          subscriptionId: subscription.id,
          ledgerTransactionId: ledgerTransaction.id,
          ledgerAccountId: ledgerAccount.id,
          usageMeterId: usageMeter.id,
          entries: [
            {
              entryType: LedgerEntryType.UsageCost,
              amount: usageEvent.amount,
              status: LedgerEntryStatus.Posted,
              sourceUsageEventId: usageEvent.id,
            },
            {
              entryType: LedgerEntryType.CreditGrantRecognized,
              amount: usageCredit.issuedAmount,
              status: LedgerEntryStatus.Posted,
              sourceUsageCreditId: usageCredit.id,
            },
            {
              entryType: LedgerEntryType.UsageCost,
              amount: secondUsageEvent.amount,
              status: LedgerEntryStatus.Pending,
              discardedAt: null,
              sourceUsageEventId: secondUsageEvent.id,
            },
            {
              entryType: LedgerEntryType.UsageCost,
              amount: thirdUsageEvent.amount,
              status: LedgerEntryStatus.Pending,
              discardedAt: Date.now(),
              sourceUsageEventId: thirdUsageEvent.id,
            },
          ],
        })

        const expectedBalance =
          usageCredit.issuedAmount -
          secondUsageEvent.amount -
          secondUsageEvent.amount
        // omit thirdUsageEvent, which is DISCARDED

        const result = (
          await adminTransaction(async ({ transaction }) => {
            return Result.ok(
              await aggregateBalanceForLedgerAccountFromEntries(
                { ledgerAccountId: ledgerAccount.id },
                'available',
                transaction
              )
            )
          })
        ).unwrap()
        expect(result).toBe(expectedBalance)
      })
      it('should correctly calculate balances with a mix of positive and negative entries', async () => {
        const coreParams = {
          organizationId: organization.id,
          livemode: subscription.livemode,
          subscriptionId: subscription.id,
          ledgerAccountId: ledgerAccount.id,
          type: LedgerTransactionType.UsageEventProcessed,
        }

        const ledgerTransaction = (
          await setupLedgerTransaction(coreParams)
        ).unwrap()
        const paramsWithTransaction = {
          ...coreParams,
          ledgerTransactionId: ledgerTransaction.id,
        }
        const amounts = [1500, -750, 200, -50, 1000, -1200, 1000]
        let expectedPostedBalance = 0
        let expectedEffectiveBalance = 0

        for (let i = 0; i < amounts.length; i++) {
          const amount = amounts[i]
          const isPending = i % 2 === 0
          const isDiscarded = isPending && i % 4 === 0
          if (amount > 0) {
            const usageCredit = (
              await setupUsageCredit({
                organizationId: organization.id,
                subscriptionId: subscription.id,
                usageMeterId: usageMeter.id,
                issuedAmount: amount,
                livemode: subscription.livemode,
                creditType: UsageCreditType.Payment,
              })
            ).unwrap()
            ;(
              await setupCreditLedgerEntry({
                ...paramsWithTransaction,
                entryType: LedgerEntryType.CreditGrantRecognized,
                amount: Math.abs(amount),
                status: isPending
                  ? LedgerEntryStatus.Pending
                  : LedgerEntryStatus.Posted,
                sourceUsageCreditId: usageCredit.id,
                usageMeterId: usageMeter.id,
              })
            ).unwrap()
          } else {
            const usageEvent = await setupUsageEvent({
              organizationId: organization.id,
              subscriptionId: subscription.id,
              usageMeterId: usageMeter.id,
              amount: Math.abs(amount),
              priceId: price.id,
              billingPeriodId: billingPeriod.id,
              transactionId: core.nanoid(),
              customerId: customer.id,
            })
            ;(
              await setupDebitLedgerEntry({
                ...paramsWithTransaction,
                entryType: LedgerEntryType.UsageCost,
                amount: Math.abs(amount),
                status: isPending
                  ? LedgerEntryStatus.Pending
                  : LedgerEntryStatus.Posted,
                sourceUsageEventId: usageEvent.id,
                usageMeterId: usageMeter.id,
              })
            ).unwrap()
          }

          if (!isPending && !isDiscarded) {
            expectedPostedBalance += amount
            expectedEffectiveBalance += amount
          } else if (!isDiscarded) {
            expectedEffectiveBalance += amount
          }
        }

        await adminTransaction(async ({ transaction }) => {
          const postedResult =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'posted',
              transaction
            )
          expect(postedResult).toBe(expectedPostedBalance)
          return Result.ok(undefined)
        })

        // await adminTransaction(async ({ transaction: adminDb }) => {
        //   const effectiveResult = await adminDb
        //     .select({
        //       total: sum(ledgerEntriesSchema.amount).mapWith(Number),
        //     })
        //     .from(ledgerEntriesSchema)
        //     .where(
        //       and(
        //         eq(
        //           ledgerEntriesSchema.subscriptionId,
        //           subscription.id
        //         ),
        //         or(
        //           eq(ledgerEntriesSchema.status, 'posted'),
        //           and(
        //             eq(ledgerEntriesSchema.status, 'pending'),
        //             isNull(ledgerEntriesSchema.discardedAt)
        //           )
        //         )
        //       )
        //     )
        //     .then((res) => res[0]?.total || 0)
        //   expect(effectiveResult).toBe(expectedEffectiveBalance)
        // })
      })
    })

    // FIXME: figure out how to enforce these at the db layer, and maybe in the business logic layer
    //     describe('2. Immutability & Lifecycle of LedgerEntries', () => {
    //       it('should prevent alteration of core financial fields of a "posted" LedgerEntry', () => {
    //         // Test logic: Attempt to update amount, currency, etc., of a posted entry
    //       })
    //       it('should ensure discarded_at remains NULL for "posted" LedgerEntries', () => {
    //         // Test logic: Check discarded_at on posted entries
    //       })
    //       it('should allow "pending" LedgerEntries to have their discarded_at field set', () => {
    //         // Test logic: Set discarded_at on a pending entry
    //       })
    //       it('should prevent a LedgerEntry with discarded_at IS NOT NULL from being transitioned to "posted"', () => {
    //         // Test logic: Attempt to post a discarded entry
    //       })
    //       it('should reject or ignore attempts to update a "posted" entry (except non-critical metadata)', () => {
    //         // Test logic: Attempt various updates
    //       })
    //       it('should correctly transition LedgerEntries from "pending" to "posted" status', () => {
    //         // Test logic: Perform status transition
    //       })
    //       it('should only allow discarded_at to be set if status is "pending"', () => {
    //         // Test logic: Attempt to set discarded_at on a posted entry
    //       })
    //     })

    describe('4. Idempotency of Event Ingestion & Processing', () => {
      describe('4.1. Idempotency Key Extraction', () => {
        it('should extract correct idempotency key for UsageEventProcessed command', () => {
          const usageEventId = 'usage_event_123'
          const usageEvent: UsageEvent.Record = {
            id: usageEventId,
            subscriptionId: subscription.id,
            customerId: customer.id,
            usageMeterId: usageMeter.id,
            priceId: price.id,
            amount: 100,
            usageDate: Date.now(),
            transactionId: core.nanoid(),
            livemode: subscription.livemode,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            pricingModelId: usageMeter.pricingModelId,
            createdByCommit: null,
            updatedByCommit: null,
            position: 0,
            billingPeriodId: null,
            properties: undefined,
          }
          const command: UsageEventProcessedLedgerCommand = {
            type: LedgerTransactionType.UsageEventProcessed,
            organizationId: organization.id,
            subscriptionId: subscription.id,
            livemode: subscription.livemode,
            payload: {
              usageEvent,
            },
          }

          const result = extractLedgerManagerIdempotencyKey(command)

          expect(result).toMatchObject({
            initiatingSourceId: usageEventId,
          })
          expect(result?.initiatingSourceType).toBe(
            LedgerTransactionInitiatingSourceType.UsageEvent
          )
          expect(result?.initiatingSourceId).toBe(usageEventId)
        })

        it('should extract correct idempotency key for BillingPeriodTransition command with standard payload', () => {
          const billingPeriodId = 'billing_period_123'
          const newBillingPeriod: BillingPeriod.Record = {
            id: billingPeriodId,
            subscriptionId: subscription.id,
            startDate: subscription.currentBillingPeriodStart!,
            endDate: subscription.currentBillingPeriodEnd!,
            livemode: subscription.livemode,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdByCommit: null,
            updatedByCommit: null,
            position: 0,
            status: BillingPeriodStatus.Active,
            trialPeriod: false,
            proratedPeriod: false,
            pricingModelId: pricingModel.id,
          }
          const command: BillingPeriodTransitionLedgerCommand = {
            type: LedgerTransactionType.BillingPeriodTransition,
            organizationId: organization.id,
            subscriptionId: subscription.id,
            livemode: subscription.livemode,
            payload: {
              type: 'standard',
              subscription,
              previousBillingPeriod: null,
              newBillingPeriod,
              subscriptionFeatureItems: [],
            },
          }

          const result = extractLedgerManagerIdempotencyKey(command)

          expect(result).toMatchObject({
            initiatingSourceId: billingPeriodId,
          })
          expect(result?.initiatingSourceType).toBe(
            LedgerTransactionType.BillingPeriodTransition
          )
          expect(result?.initiatingSourceId).toBe(billingPeriodId)
        })

        it('should extract correct idempotency key for BillingPeriodTransition command with non_renewing payload', () => {
          const command: BillingPeriodTransitionLedgerCommand = {
            type: LedgerTransactionType.BillingPeriodTransition,
            organizationId: organization.id,
            subscriptionId: subscription.id,
            livemode: subscription.livemode,
            payload: {
              type: 'non_renewing',
              subscription,
              subscriptionFeatureItems: [],
            },
          }

          const result = extractLedgerManagerIdempotencyKey(command)

          expect(result).toMatchObject({
            initiatingSourceId: subscription.id,
          })
          expect(result?.initiatingSourceType).toBe(
            LedgerTransactionType.BillingPeriodTransition
          )
          expect(result?.initiatingSourceId).toBe(subscription.id)
        })

        it('should extract correct idempotency key for CreditGrantRecognized command', () => {
          const usageCreditId = 'usage_credit_123'
          const usageCredit: UsageCredit.Record = {
            id: usageCreditId,
            subscriptionId: subscription.id,
            organizationId: organization.id,
            livemode: subscription.livemode,
            creditType: UsageCreditType.Grant,
            sourceReferenceId: null,
            sourceReferenceType:
              UsageCreditSourceReferenceType.BillingPeriodTransition,
            billingPeriodId: billingPeriod.id,
            usageMeterId: usageMeter.id,
            pricingModelId: usageMeter.pricingModelId,
            paymentId: null,
            issuedAmount: 1000,
            issuedAt: Date.now(),
            expiresAt: null,
            status: UsageCreditStatus.Pending,
            notes: null,
            metadata: undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdByCommit: null,
            updatedByCommit: null,
            position: 0,
          }
          const command: CreditGrantRecognizedLedgerCommand = {
            type: LedgerTransactionType.CreditGrantRecognized,
            organizationId: organization.id,
            subscriptionId: subscription.id,
            livemode: subscription.livemode,
            payload: {
              usageCredit,
            },
          }

          const result = extractLedgerManagerIdempotencyKey(command)

          expect(result).toMatchObject({
            initiatingSourceId: usageCreditId,
          })
          expect(result?.initiatingSourceType).toBe(
            LedgerTransactionType.CreditGrantRecognized
          )
          expect(result?.initiatingSourceId).toBe(usageCreditId)
        })

        it('should extract correct idempotency key for SettleInvoiceUsageCosts command', () => {
          const invoiceId = 'invoice_123'
          const invoice: Invoice.Record = {
            id: invoiceId,
            type: InvoiceType.Subscription,
            organizationId: organization.id,
            customerId: customer.id,
            subscriptionId: subscription.id,
            purchaseId: null,
            invoiceNumber: `TEST-${core.nanoid()}`,
            invoiceDate: Date.now(),
            billingPeriodId: billingPeriod.id,
            dueDate: Date.now(),
            stripePaymentIntentId: null,
            status: InvoiceStatus.Paid,
            billingRunId: 'billing_run_123',
            billingPeriodStartDate: billingPeriod.startDate,
            billingPeriodEndDate: billingPeriod.endDate,
            ownerMembershipId: null,
            pdfURL: null,
            receiptPdfURL: null,
            memo: null,
            bankPaymentOnly: false,
            currency: CurrencyCode.USD,
            taxCountry: null,
            taxRatePercentage: null,
            taxAmount: null,
            applicationFee: null,
            stripeTaxCalculationId: null,
            stripeTaxTransactionId: null,
            subtotal: 5000,
            taxState: null,
            taxType: null,
            livemode: subscription.livemode,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdByCommit: null,
            updatedByCommit: null,
            position: 0,
            pricingModelId: pricingModel.id,
          }
          const invoiceLineItem: InvoiceLineItem.Record = {
            id: 'line_item_123',
            invoiceId: invoiceId,
            priceId: price.id,
            quantity: 1,
            price: 5000,
            description: null,
            ledgerAccountId: ledgerAccount.id,
            type: SubscriptionItemType.Usage,
            ledgerAccountCredit: 5000,
            billingRunId: 'billing_run_123',
            livemode: subscription.livemode,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdByCommit: null,
            updatedByCommit: null,
            position: 0,
            pricingModelId: pricingModel.id,
          }
          const command: SettleInvoiceUsageCostsLedgerCommand = {
            type: LedgerTransactionType.SettleInvoiceUsageCosts,
            organizationId: organization.id,
            subscriptionId: subscription.id,
            livemode: subscription.livemode,
            payload: {
              invoice,
              invoiceLineItems: [invoiceLineItem],
            },
          }

          const result = extractLedgerManagerIdempotencyKey(command)

          expect(result).toMatchObject({
            initiatingSourceId: invoiceId,
          })
          expect(result?.initiatingSourceType).toBe(
            LedgerTransactionInitiatingSourceType.InvoiceSettlement
          )
          expect(result?.initiatingSourceId).toBe(invoiceId)
        })

        it('should extract correct idempotency key for AdminCreditAdjusted command', () => {
          const adjustmentId = 'adjustment_123'
          const usageCreditBalanceAdjustment: UsageCreditBalanceAdjustment.Record =
            {
              id: adjustmentId,
              organizationId: organization.id,
              adjustedUsageCreditId: 'usage_credit_456',
              amountAdjusted: 500,
              reason: 'Admin adjustment',
              adjustedByUserId: null,
              adjustmentInitiatedAt: Date.now(),
              notes: 'Admin adjustment',
              livemode: subscription.livemode,
              usageMeterId: usageMeter.id,
              pricingModelId: usageMeter.pricingModelId,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              createdByCommit: null,
              updatedByCommit: null,
              position: 0,
              metadata: undefined,
            }
          const command: AdminCreditAdjustedLedgerCommand = {
            type: LedgerTransactionType.AdminCreditAdjusted,
            organizationId: organization.id,
            subscriptionId: subscription.id,
            livemode: subscription.livemode,
            payload: {
              usageCreditBalanceAdjustment,
            },
          }

          const result = extractLedgerManagerIdempotencyKey(command)

          expect(result).toMatchObject({
            initiatingSourceId: adjustmentId,
          })
          expect(result?.initiatingSourceType).toBe(
            LedgerTransactionType.AdminCreditAdjusted
          )
          expect(result?.initiatingSourceId).toBe(adjustmentId)
        })

        it('should extract correct idempotency key for CreditGrantExpired command', () => {
          const expiredUsageCreditId = 'expired_credit_123'
          const expiredUsageCredit: UsageCredit.Record = {
            id: expiredUsageCreditId,
            subscriptionId: subscription.id,
            organizationId: organization.id,
            pricingModelId: usageMeter.pricingModelId,
            livemode: subscription.livemode,
            creditType: UsageCreditType.Grant,
            sourceReferenceId: null,
            sourceReferenceType:
              UsageCreditSourceReferenceType.BillingPeriodTransition,
            billingPeriodId: billingPeriod.id,
            usageMeterId: usageMeter.id,
            paymentId: null,
            issuedAmount: 1000,
            issuedAt: Date.now() - 100 * 24 * 60 * 60 * 1000, // 100 days ago
            expiresAt: Date.now() - 1, // Expired
            status: UsageCreditStatus.Posted,
            notes: null,
            metadata: undefined,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdByCommit: null,
            updatedByCommit: null,
            position: 0,
          }
          const command: CreditGrantExpiredLedgerCommand = {
            type: LedgerTransactionType.CreditGrantExpired,
            organizationId: organization.id,
            subscriptionId: subscription.id,
            livemode: subscription.livemode,
            payload: {
              expiredUsageCredit,
              expiredAmountValue: 500,
            },
          }

          const result = extractLedgerManagerIdempotencyKey(command)

          expect(result).toMatchObject({})
          expect(result?.initiatingSourceType).toBe(
            LedgerTransactionType.CreditGrantExpired
          )
          expect(result?.initiatingSourceId).toBe(
            expiredUsageCreditId
          )
        })

        it('should extract correct idempotency key for PaymentRefunded command', () => {
          const refundId = 'refund_123'
          const refund: Refund.Record = {
            id: refundId,
            organizationId: organization.id,
            pricingModelId: pricingModel.id,
            paymentId: 'payment_123',
            subscriptionId: subscription.id,
            amount: 2000,
            currency: CurrencyCode.USD,
            reason: null,
            status: RefundStatus.Succeeded,
            refundProcessedAt: Date.now(),
            gatewayRefundId: null,
            notes: null,
            initiatedByUserId: null,
            livemode: subscription.livemode,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdByCommit: null,
            updatedByCommit: null,
            position: 0,
          }
          const command: PaymentRefundedLedgerCommand = {
            type: LedgerTransactionType.PaymentRefunded,
            organizationId: organization.id,
            subscriptionId: subscription.id,
            livemode: subscription.livemode,
            payload: {
              refund,
              adjustmentBehavior:
                PaymentRefundedLedgerCommandAdjustmentBehavior.RevertUnusedCredits,
            },
          }

          const result = extractLedgerManagerIdempotencyKey(command)

          expect(result).toMatchObject({
            initiatingSourceId: refundId,
          })
          expect(result?.initiatingSourceType).toBe(
            LedgerTransactionType.PaymentRefunded
          )
          expect(result?.initiatingSourceId).toBe(refundId)
        })
      })

      describe('4.2. Idempotent Command Processing', () => {
        it('should return the same transaction and entries when processing the same usage event command multiple times', async () => {
          await adminTransaction(async ({ transaction }) => {
            const usageEvent = await setupUsageEvent({
              organizationId: organization.id,
              subscriptionId: subscription.id,
              usageMeterId: usageMeter.id,
              amount: 100,
              priceId: price.id,
              billingPeriodId: billingPeriod.id,
              transactionId: core.nanoid(),
              customerId: customer.id,
              livemode: subscription.livemode,
            })

            const command: UsageEventProcessedLedgerCommand = {
              type: LedgerTransactionType.UsageEventProcessed,
              organizationId: organization.id,
              subscriptionId: subscription.id,
              livemode: subscription.livemode,
              payload: {
                usageEvent,
              },
            }

            // First processing
            const firstResult = (
              await processLedgerCommand(command, transaction)
            ).unwrap()

            expect(firstResult.ledgerTransaction.type).toBe(
              LedgerTransactionType.UsageEventProcessed
            )
            expect(
              firstResult.ledgerTransaction.initiatingSourceType
            ).toBe(LedgerTransactionInitiatingSourceType.UsageEvent)
            expect(
              firstResult.ledgerTransaction.initiatingSourceId
            ).toBe(usageEvent.id)
            expect(firstResult.ledgerEntries.length).toBeGreaterThan(
              0
            )

            // Second processing with the same command
            const secondResult = (
              await processLedgerCommand(command, transaction)
            ).unwrap()

            // Should return the same transaction
            expect(secondResult.ledgerTransaction.id).toBe(
              firstResult.ledgerTransaction.id
            )
            expect(secondResult.ledgerTransaction.type).toBe(
              LedgerTransactionType.UsageEventProcessed
            )

            // Should return the same entries (no duplicates created)
            expect(secondResult.ledgerEntries.length).toBe(
              firstResult.ledgerEntries.length
            )
            expect(
              secondResult.ledgerEntries
                .map((e: LedgerEntry.Record) => e.id)
                .sort()
            ).toEqual(
              firstResult.ledgerEntries
                .map((e: LedgerEntry.Record) => e.id)
                .sort()
            )
            return Result.ok(undefined)
          })
        })

        it('should return the same transaction and entries when processing the same billing period transition command multiple times', async () => {
          await adminTransaction(async ({ transaction }) => {
            const previousBillingPeriod = await setupBillingPeriod({
              subscriptionId: subscription.id,
              startDate:
                subscription.currentBillingPeriodStart! -
                30 * 24 * 60 * 60 * 1000,
              endDate: subscription.currentBillingPeriodStart! - 1,
              livemode: subscription.livemode,
            })

            const newBillingPeriod = await setupBillingPeriod({
              subscriptionId: subscription.id,
              startDate: subscription.currentBillingPeriodStart!,
              endDate: subscription.currentBillingPeriodEnd!,
              livemode: subscription.livemode,
            })

            const command: BillingPeriodTransitionLedgerCommand = {
              type: LedgerTransactionType.BillingPeriodTransition,
              organizationId: organization.id,
              subscriptionId: subscription.id,
              livemode: subscription.livemode,
              payload: {
                type: 'standard',
                subscription,
                previousBillingPeriod,
                newBillingPeriod,
                subscriptionFeatureItems: [], // Empty for simplicity
              },
            }

            // First processing
            const firstResult = (
              await processLedgerCommand(command, transaction)
            ).unwrap()

            expect(firstResult.ledgerTransaction.type).toBe(
              LedgerTransactionType.BillingPeriodTransition
            )
            expect(
              firstResult.ledgerTransaction.initiatingSourceId
            ).toBe(newBillingPeriod.id)

            // Second processing with the same command
            const secondResult = (
              await processLedgerCommand(command, transaction)
            ).unwrap()

            // Should return the same transaction
            expect(secondResult.ledgerTransaction.id).toBe(
              firstResult.ledgerTransaction.id
            )
            expect(secondResult.ledgerTransaction.type).toBe(
              LedgerTransactionType.BillingPeriodTransition
            )

            // Should return the same entries (no duplicates created)
            expect(secondResult.ledgerEntries.length).toBe(
              firstResult.ledgerEntries.length
            )
            expect(
              secondResult.ledgerEntries
                .map((e: LedgerEntry.Record) => e.id)
                .sort()
            ).toEqual(
              firstResult.ledgerEntries
                .map((e: LedgerEntry.Record) => e.id)
                .sort()
            )
            return Result.ok(undefined)
          })
        })

        it('should allow processing different billing periods for the same subscription', async () => {
          await adminTransaction(async ({ transaction }) => {
            const previousBillingPeriod = await setupBillingPeriod({
              subscriptionId: subscription.id,
              startDate:
                subscription.currentBillingPeriodStart! -
                30 * 24 * 60 * 60 * 1000,
              endDate: subscription.currentBillingPeriodStart! - 1,
              livemode: subscription.livemode,
            })

            const newBillingPeriod = await setupBillingPeriod({
              subscriptionId: subscription.id,
              startDate: subscription.currentBillingPeriodStart!,
              endDate: subscription.currentBillingPeriodEnd!,
              livemode: subscription.livemode,
            })

            const firstCommand: BillingPeriodTransitionLedgerCommand =
              {
                type: LedgerTransactionType.BillingPeriodTransition,
                organizationId: organization.id,
                subscriptionId: subscription.id,
                livemode: subscription.livemode,
                payload: {
                  type: 'standard',
                  subscription,
                  previousBillingPeriod,
                  newBillingPeriod,
                  subscriptionFeatureItems: [],
                },
              }

            // First processing
            const firstResult = (
              await processLedgerCommand(firstCommand, transaction)
            ).unwrap()

            expect(
              firstResult.ledgerTransaction.initiatingSourceId
            ).toBe(newBillingPeriod.id)

            // Create a different billing period
            const secondBillingPeriod = await setupBillingPeriod({
              subscriptionId: subscription.id,
              startDate: newBillingPeriod.endDate + 1,
              endDate:
                newBillingPeriod.endDate + 30 * 24 * 60 * 60 * 1000,
              livemode: subscription.livemode,
            })

            const secondCommand: BillingPeriodTransitionLedgerCommand =
              {
                type: LedgerTransactionType.BillingPeriodTransition,
                organizationId: organization.id,
                subscriptionId: subscription.id,
                livemode: subscription.livemode,
                payload: {
                  type: 'standard',
                  subscription,
                  previousBillingPeriod: newBillingPeriod,
                  newBillingPeriod: secondBillingPeriod,
                  subscriptionFeatureItems: [],
                },
              }

            // Second processing with different billing period
            const secondResult = (
              await processLedgerCommand(secondCommand, transaction)
            ).unwrap()

            // Should create a new transaction (different billing period)
            expect(
              secondResult.ledgerTransaction.initiatingSourceId
            ).toBe(secondBillingPeriod.id)
            expect(secondResult.ledgerTransaction.id).not.toBe(
              firstResult.ledgerTransaction.id
            )
            return Result.ok(undefined)
          })
        })
      })
    })

    //     describe('5. Traceability & Referential Integrity', () => {
    //       it('should ensure every LedgerEntry has a valid usage_transaction_id linking to an existing LedgerTransaction', () => {
    //         // Test logic: Check FK constraints or query for orphaned entries
    //       })
    //       it('should ensure every LedgerEntry has valid foreign keys to its source record(s) as dictated by its entry_type', () => {
    //         // Test logic: Check various entry_types and their source links
    //       })
    //       it('should prevent orphaned LedgerEntries (without a valid LedgerTransaction or source)', () => {
    //         // Test logic: Query for entries with invalid FKs
    //       })
    //       it('should ensure all LedgerEntries for a given LedgerTransaction logically belong to the same originating business operation', () => {
    //         // Test logic: Verify consistency of entries within a transaction
    //       })
    //     })

    //     describe('7. LedgerTransaction Integrity', () => {
    //       it('should create a LedgerTransaction record for each distinct business operation', () => {
    //         // Test logic: Verify LedgerTransaction creation for various ops
    //       })
    //       it('should ensure LedgerTransaction records have appropriate initiating_source_type and initiating_source_id', () => {
    //         // Test logic: Check these fields for correctness
    //       })
    //     })
    //   })

    //   describe('II. Workflow-Specific Test Cases', () => {
    //     describe('A. Usage Event Ingestion & Cost Accrual Workflow', () => {
    //       it('should create a "usage_cost" LedgerEntry for a valid UsageEvent', () => {
    //         // Test logic
    //       })
    //       it('should ensure the "usage_cost" LedgerEntry has correct negative amount, currency, and source links', () => {
    //         // Test logic
    //       })
    //       it('should assign the correct initial status (posted or pending) to "usage_cost" LedgerEntries', () => {
    //         // Test logic
    //       })
    //       it('should generate correct "usage_cost" LedgerEntries for multiple UsageEvents', () => {
    //         // Test logic
    //       })
    //     })

    //     describe('B. Payment Confirmation & Associated Credit Granting Workflow', () => {
    //       it('should create a UsageCredits grant and a "payment_recognized" LedgerEntry on successful Payment confirmation for an Invoice', () => {
    //         // Test logic
    //       })
    //       it('should correctly handle a standard invoice settlement scenario', () => {
    //         // Test logic
    //       })
    //       it('should correctly handle a PAYG/Top-up payment scenario', () => {
    //         // Test logic
    //       })
    //       it('should not create/activate UsageCredits or post "payment_recognized" LedgerEntry on failed Payment', () => {
    //         // Test logic
    //       })
    //       it('should update Invoice status to "paid" upon successful payment and ledger posting', () => {
    //         // Test logic
    //       })
    //     })

    //     describe('C. Promotional / Goodwill / Non-Payment Credit Granting Workflow', () => {
    //       it('should create a UsageCredits grant and a "credit_grant_recognized" LedgerEntry for admin/system credit grants', () => {
    //         // Test logic
    //       })
    //       it('should correctly handle grants with an expires_at date', () => {
    //         // Test logic
    //       })
    //       it('should correctly handle grants scoped to a specific billing_period_id or usage_meter_id', () => {
    //         // Test logic
    //       })
    //     })

    //     describe('D. Applying Credits to Usage Workflow (e.g., during Billing Run)', () => {
    //       describe('D.1. LedgerTransaction Context', () => {
    //         it('should occur within a LedgerTransaction for credit application', () => {
    //           // Test logic
    //         })
    //       })
    //       describe('D.2. UsageCreditApplications Record Creation', () => {
    //         it('should create correct UsageCreditApplications records for each grant portion applied', () => {
    //           // Test logic
    //         })
    //       })
    //       describe('D.3. LedgerEntry for Credit Application', () => {
    //         it('should create a "credit_applied_to_usage" LedgerEntry with status "pending" initially', () => {
    //           // Test logic
    //         })
    //         it('should ensure the "credit_applied_to_usage" LedgerEntry has correct positive amount and source links', () => {
    //           // Test logic
    //         })
    //       })
    //       describe('D.4. Lifecycle of "pending" Credit Application Entries', () => {
    //         it('should correctly mark existing "pending" items as discarded_at if credit application logic iterates', () => {
    //           // Test logic
    //         })
    //         it('should create new "pending" items superseding discarded ones during iteration', () => {
    //           // Test logic
    //         })
    //         it('should transition all non-discarded "pending" items to "posted" at the end of the operational context', () => {
    //           // Test logic
    //         })
    //         it('should NOT transition items with discarded_at IS NOT NULL to "posted"', () => {
    //           // Test logic
    //         })
    //       })
    //       describe('D.5. Credit Sufficiency Scenarios', () => {
    //         it('should handle a single UsageCredits grant fully covering a usage_cost', () => {
    //           // Test logic
    //         })
    //         it('should handle a single UsageCredits grant partially covering a usage_cost', () => {
    //           // Test logic
    //         })
    //         it('should handle multiple UsageCredits grants combining to cover usage_cost(s)', () => {
    //           // Test logic
    //         })
    //         it('should apply all available credit and leave a net debit if credit is insufficient', () => {
    //           // Test logic
    //         })
    //       })
    //       describe('D.6. Credit Application Rules', () => {
    //         it('should follow specific ordering rules if implemented (e.g., oldest first, promo first)', () => {
    //           // Test logic
    //         })
    //       })
    //       describe('D.7. No Credit Available', () => {
    //         it('should directly impact subscription balance with usage_cost if no credit is available', () => {
    //           // Test logic
    //         })
    //       })
    //     })

    //     describe('E. Administrative Adjustment of Credit Balance Workflow (e.g., Clawback)', () => {
    //       it('should create UsageCreditBalanceAdjustments and "credit_balance_adjusted" LedgerEntry for admin adjustments', () => {
    //         // Test logic
    //       })
    //       it('should correctly adjust an unspent UsageCredits grant', () => {
    //         // Test logic
    //       })
    //       it('should correctly adjust a partially spent UsageCredits grant', () => {
    //         // Test logic
    //       })
    //       it('should cap adjustment at unspent value or fail if attempting to adjust by more', () => {
    //         // Test logic
    //       })
    //     })

    //     describe('F. Credit Grant Expiration Workflow', () => {
    //       it('should create a "credit_grant_expired" LedgerEntry for an expired UsageCredits grant', () => {
    //         // Test logic
    //       })
    //       it('should correctly handle a fully unused grant expiring', () => {
    //         // Test logic
    //       })
    //       it('should correctly handle a partially used grant expiring (calculating remaining unused portion)', () => {
    //         // Test logic
    //       })
    //       it('should not create a "credit_grant_expired" item if grant is fully used before expires_at', () => {
    //         // Test logic
    //       })
    //       it('should ensure batch job for expirations correctly identifies and processes eligible credits', () => {
    //         // Test logic
    //       })
    //     })

    //     describe('G. Payment Refund Processing Workflow', () => {
    //       it('should create a Refunds record with "pending" status on refund initiation', () => {
    //         // Test logic
    //       })
    //       it('should update Refunds status to "succeeded" and create a "payment_refunded" LedgerEntry on successful gateway confirmation', () => {
    //         // Test logic
    //       })
    //       it('should update Refunds status to "failed" and not post "payment_refunded" LedgerEntry on failed gateway confirmation', () => {
    //         // Test logic
    //       })
    //       it('should handle full refund for a Payment whose associated UsageCredits grant is unused', () => {
    //         // Test logic
    //       })
    //       it('should handle partial refund for a Payment', () => {
    //         // Test logic
    //       })
    //       it('should correctly reflect deficit in subscription balance if refunding a Payment whose credit was spent', () => {
    //         // Test logic
    //       })
    //       it('(Optional) should create UsageCreditBalanceAdjustments for the original grant if its funding was refunded', () => {
    //         // Test logic
    //       })
    //     })

    //     describe('H. Billing Recalculation and Adjustment Workflow', () => {
    //       it('should create a new SMPC record and supersede the old one on recalculation', () => {
    //         // Test logic: Check SMPC_new creation, SMPC_old status update
    //       })
    //       it('should create a "billing_adjustment" LedgerEntry reflecting the net change', () => {
    //         // Test logic: Verify amount, source_billing_period_calculation_id
    //       })
    //       it('should handle positive adjustments (new charge higher)', () => {
    //         // Test logic
    //       })
    //       it('should handle negative adjustments (new charge lower / credit)', () => {
    //         // Test logic
    //       })
    //     })

    //     describe('I. SubscriptionMeterPeriodCalculations (SMPC) Snapshot Generation Workflow', () => {
    //       it('should create/update an SMPC record at the end of a calculation run', () => {
    //         // Test logic
    //       })
    //       it('should ensure SMPC fields correctly aggregate amounts from relevant "posted" LedgerEntries', () => {
    //         // Test logic: Check total_raw_usage_amount, credits_applied_amount, net_billed_amount
    //       })
    //       it('should correctly handle SMPC status (active, superseded)', () => {
    //         // Test logic
    //       })
    //       it('should correctly link SMPC to source_invoice_id or source_credit_note_id', () => {
    //         // Test logic
    //       })
    //       it('should respect the UNIQUE constraint on SMPC calculation_run_id', () => {
    //         // Test logic: Attempt to create duplicate
    //       })
    //       it('should respect the UNIQUE constraint on SMPC (subscription_id, usage_meter_id, billing_period_id, status) WHERE status is active', () => {
    //         // Test logic: Attempt to create duplicate active calculation
    //       })
    //     })
    //   })

    //   describe('III. Scenario-Based Integration Tests', () => {
    //     describe('1. Post-Paid Billing with Async Payment', () => {
    //       it('should allow usage to accrue, ECCA balance goes negative (within credit limit)', () => {
    //         // Test logic
    //       })
    //       it('should generate an Invoice when billing period ends', () => {
    //         // Test logic
    //       })
    //       it('should handle async payment initiation (Payment.status = "processing")', () => {
    //         // Test logic
    //       })
    //       it('should correctly process successful async payment (Invoice paid, UsageCredits granted, LedgerEntry posted, ECCA settles)', () => {
    //         // Test logic
    //       })
    //       it('should correctly process failed async payment (Invoice remains open, ECCA remains negative)', () => {
    //         // Test logic
    //       })
    //     })

    //     describe('2. One-Time Free Grant, then Paid Subscription with Expiring Monthly Credits', () => {
    //       it('should grant free UsageCredits and post "promo_credit_recognized" LedgerEntry on signup', () => {
    //         // Test logic
    //       })
    //       it('should allow usage to consume free credits', () => {
    //         // Test logic
    //       })
    //       it('should handle transition to paid: Invoice for plan, payment, new monthly UsageCredits, "payment_recognized" LedgerEntry', () => {
    //         // Test logic
    //       })
    //       it('should expire unused portion of monthly grant at period end and post "credit_grant_expired" LedgerEntry', () => {
    //         // Test logic
    //       })
    //       it('should correctly handle subsequent monthly renewals (payment, new grant, old grant expiration)', () => {
    //         // Test logic
    //       })
    //     })

    //     describe('3. PAYG Wallet with Durable, Non-Expiring Credits', () => {
    //       it('should handle customer top-up: Invoice, payment, durable UsageCredits grant, "payment_recognized" LedgerEntry', () => {
    //         // Test logic: Ensure UsageCredits.expires_at is NULL
    //       })
    //       it('should allow usage to consume durable credits', () => {
    //         // Test logic
    //       })
    //       it('should block further usage if balance is exhausted (and credit limit is zero)', () => {
    //         // Test logic
    //       })
    //     })

    //     describe('4. Monthly Plan with Expiring Credits + Overage (Spike & Payment Failure)', () => {
    //       it('should grant monthly expiring UsageCredits on plan fee payment at start of period', () => {
    //         // Test logic
    //       })
    //       it('should allow usage to consume granted credits and then accrue overage (ECCA goes negative within credit limit)', () => {
    //         // Test logic
    //       })
    //       it('should check against credit limit before authorizing a large usage spike', () => {
    //         // Test logic
    //       })
    //       it('should expire unused monthly credits and invoice for next period plan fee + current overage at end of period', () => {
    //         // Test logic
    //       })
    //       it('should correctly process successful payment for combined invoice (new grant, overage settled)', () => {
    //         // Test logic
    //       })
    //       it('should correctly process failed payment for combined invoice (no new grant, ECCA remains negative, subscription suspended)', () => {
    //         // Test logic
    //       })
    //     })
  })
})
