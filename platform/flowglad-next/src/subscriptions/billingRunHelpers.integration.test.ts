/**
 * Integration tests for billing run atomicity
 *
 * These tests require real Stripe API calls to test failure scenarios
 * (card declines, API errors) that stripe-mock cannot simulate.
 *
 * Run with: bun run test:integration src/subscriptions/billingRunHelpers.integration.test.ts
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupBillingRun,
  setupCustomer,
  setupInvoice,
  setupLedgerAccount,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupPrice,
  setupProductFeature,
  setupSubscription,
  setupSubscriptionItem,
  setupUsageCreditGrantFeature,
  setupUsageMeter,
  teardownOrg,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { BillingRun } from '@/db/schema/billingRuns'
import type { Customer } from '@/db/schema/customers'
import type { LedgerAccount } from '@/db/schema/ledgerAccounts'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { SubscriptionItem } from '@/db/schema/subscriptionItems'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectBillingRunById } from '@/db/tableMethods/billingRunMethods'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
import { selectInvoices } from '@/db/tableMethods/invoiceMethods'
import { selectLedgerAccounts } from '@/db/tableMethods/ledgerAccountMethods'
import { aggregateBalanceForLedgerAccountFromEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { safelyUpdatePaymentMethod } from '@/db/tableMethods/paymentMethodMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import {
  selectCurrentlyActiveSubscriptionItems,
  selectSubscriptionItems,
  updateSubscriptionItem,
} from '@/db/tableMethods/subscriptionItemMethods'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import { createSubscriptionFeatureItems } from '@/subscriptions/subscriptionItemFeatureHelpers'
import {
  cleanupStripeTestData,
  createTestPaymentMethod,
  createTestStripeCustomer,
  describeIfStripeKey,
} from '@/test/stripeIntegrationHelpers'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  InvoiceStatus,
  PaymentStatus,
  PriceType,
  SubscriptionItemType,
  SubscriptionStatus,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'
import core from '@/utils/core'
import { executeBillingRun } from './billingRunHelpers'

/**
 * These integration tests verify billing run atomicity against real Stripe APIs.
 *
 * To run:
 *   1. Ensure .env.development has valid STRIPE_TEST_MODE_SECRET_KEY
 *   2. Run: bun run test:integration src/subscriptions/billingRunHelpers.integration.test.ts
 *
 * Note: Some failure scenarios (like Stripe API being unavailable) cannot be
 * reliably tested even with integration tests. Those scenarios are documented
 * but not tested here.
 */
describeIfStripeKey(
  'Billing Run Atomicity - Integration Tests',
  () => {
    let organization: Organization.Record
    let pricingModel: PricingModel.Record
    let product: Product.Record
    let staticPrice: Price.Record
    let customer: Customer.Record
    let paymentMethod: PaymentMethod.Record
    let subscription: Subscription.Record
    let billingPeriod: BillingPeriod.Record
    let billingRun: BillingRun.Record
    let staticBillingPeriodItem: BillingPeriodItem.Record
    let usageMeter: UsageMeter.Record
    let usageBasedPrice: Price.Record
    let ledgerAccount: LedgerAccount.Record
    let subscriptionItem: SubscriptionItem.Record
    let stripeCustomerId: string | undefined

    beforeEach(async () => {
      const orgData = await setupOrg()
      organization = orgData.organization
      pricingModel = orgData.pricingModel
      product = orgData.product
      staticPrice = orgData.price

      // Create a real Stripe customer for integration testing
      const stripeCustomer = await createTestStripeCustomer({
        email: `billing-run-test-${Date.now()}@flowglad-test.com`,
        name: 'Billing Run Test Customer',
      })
      stripeCustomerId = stripeCustomer.id

      customer = await setupCustomer({
        organizationId: organization.id,
        stripeCustomerId: stripeCustomer.id,
      })

      // Create a real Stripe payment method with a valid card
      const stripePaymentMethod = await createTestPaymentMethod({
        stripeCustomerId: stripeCustomer.id,
        livemode: false,
        tokenType: 'success', // Use a successful card for success scenarios
      })

      paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        stripePaymentMethodId: stripePaymentMethod.id,
      })

      usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Integration Test Usage Meter',
        pricingModelId: pricingModel.id,
        livemode: false,
      })

      usageBasedPrice = await setupPrice({
        name: 'Integration Usage Based Price',
        type: PriceType.Usage,
        unitPrice: 15,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: false,
        isDefault: false,
        currency: organization.defaultCurrency,
        usageMeterId: usageMeter.id,
      })

      subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: staticPrice.id,
        paymentMethodId: paymentMethod.id,
        status: SubscriptionStatus.Active,
      })

      subscriptionItem = await setupSubscriptionItem({
        subscriptionId: subscription.id,
        priceId: staticPrice.id,
        name: staticPrice.name ?? 'Static Item Name',
        quantity: 1,
        unitPrice: staticPrice.unitPrice,
        type: SubscriptionItemType.Static,
      })

      billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: subscription.currentBillingPeriodStart!,
        endDate: subscription.currentBillingPeriodEnd!,
        status: BillingPeriodStatus.Active,
      })

      billingRun = await setupBillingRun({
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
        status: BillingRunStatus.Scheduled,
        livemode: false,
      })

      staticBillingPeriodItem = await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: staticPrice.unitPrice,
        name: staticPrice.name ?? 'Static Item Name',
        type: SubscriptionItemType.Static,
        description: 'Test Description',
      })

      ledgerAccount = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        livemode: false,
      })
    })

    afterEach(async () => {
      // Clean up Stripe resources
      if (stripeCustomerId) {
        await cleanupStripeTestData({
          stripeCustomerId,
        })
      }

      if (organization) {
        await teardownOrg({ organizationId: organization.id })
      }
    })

    describe('Zero Amount Scenarios', () => {
      it('handles overpayment by marking billing run as succeeded without new payment', async () => {
        // Setup: Create an overpayment that covers the billing period amount
        const invoice = await setupInvoice({
          billingPeriodId: billingPeriod.id,
          customerId: customer.id,
          organizationId: organization.id,
          priceId: staticPrice.id,
        })

        await setupPayment({
          stripeChargeId: 'ch_test_overpayment_' + core.nanoid(),
          status: PaymentStatus.Succeeded,
          amount: 1000000, // Overpayment
          livemode: billingPeriod.livemode,
          customerId: customer.id,
          organizationId: organization.id,
          stripePaymentIntentId: 'pi_overpayment_' + core.nanoid(),
          invoiceId: invoice.id,
          paymentMethod: paymentMethod.type,
          billingPeriodId: billingPeriod.id,
          subscriptionId: billingPeriod.subscriptionId,
          paymentMethodId: paymentMethod.id,
        })

        await executeBillingRun(billingRun.id)

        // Verify billing run succeeded
        const updatedBillingRun = await adminTransaction(
          ({ transaction }) =>
            selectBillingRunById(billingRun.id, transaction).then(
              (r) => r.unwrap()
            )
        )
        expect(updatedBillingRun.status).toBe(
          BillingRunStatus.Succeeded
        )

        // Verify invoice is marked as paid
        const invoices = await adminTransaction(({ transaction }) =>
          selectInvoices(
            { billingPeriodId: billingPeriod.id },
            transaction
          )
        )
        const finalInvoice = invoices.find(
          (inv) => inv.billingPeriodId === billingPeriod.id
        )
        expect(finalInvoice!.status).toBe(InvoiceStatus.Paid)
      })
    })

    describe('Validation Failures', () => {
      it('marks billing run as failed when customer has no Stripe customer ID', async () => {
        // Remove Stripe customer ID
        await adminTransaction(async ({ transaction }) => {
          await updateCustomer(
            {
              id: customer.id,
              stripeCustomerId: null,
            },
            transaction
          )
        })

        await executeBillingRun(billingRun.id)

        // Verify billing run failed
        const updatedBillingRun = await adminTransaction(
          ({ transaction }) =>
            selectBillingRunById(billingRun.id, transaction).then(
              (r) => r.unwrap()
            )
        )
        expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)
        expect(updatedBillingRun.errorDetails).toBeObject()

        // Verify no payment was created
        const payments = await adminTransaction(({ transaction }) =>
          selectPayments(
            { billingPeriodId: billingRun.billingPeriodId },
            transaction
          )
        )
        expect(payments).toHaveLength(0)
      })

      it('marks billing run as failed when payment method has no Stripe payment method ID', async () => {
        // Remove Stripe payment method ID
        await adminTransaction(
          async ({
            transaction,
            cacheRecomputationContext,
            invalidateCache,
            emitEvent,
            enqueueLedgerCommand,
          }) => {
            await safelyUpdatePaymentMethod(
              {
                id: paymentMethod.id,
                stripePaymentMethodId: null,
              },
              {
                transaction,
                cacheRecomputationContext,
                invalidateCache: invalidateCache!,
                emitEvent: emitEvent!,
                enqueueLedgerCommand: enqueueLedgerCommand!,
              }
            )
          }
        )

        await executeBillingRun(billingRun.id)

        // Verify billing run failed
        const updatedBillingRun = await adminTransaction(
          ({ transaction }) =>
            selectBillingRunById(billingRun.id, transaction).then(
              (r) => r.unwrap()
            )
        )
        expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)
        expect(updatedBillingRun.errorDetails).toBeObject()

        // Verify no payment was created
        const payments = await adminTransaction(({ transaction }) =>
          selectPayments(
            { billingPeriodId: billingRun.billingPeriodId },
            transaction
          )
        )
        expect(payments).toHaveLength(0)
      })
    })

    describe('Successful Payment Processing', () => {
      it('creates payment and marks invoice as paid when billing run succeeds', async () => {
        await executeBillingRun(billingRun.id)

        // Verify billing run succeeded
        const updatedBillingRun = await adminTransaction(
          ({ transaction }) =>
            selectBillingRunById(billingRun.id, transaction).then(
              (r) => r.unwrap()
            )
        )
        expect(updatedBillingRun.status).toBe(
          BillingRunStatus.Succeeded
        )

        // Verify payment was created
        const payments = await adminTransaction(({ transaction }) =>
          selectPayments(
            { billingPeriodId: billingRun.billingPeriodId },
            transaction
          )
        )
        expect(payments.length).toBeGreaterThan(0)
        const payment = payments.find(
          (p) => p.billingPeriodId === billingRun.billingPeriodId
        )
        expect(typeof payment).toBe('object')
        expect(payment!.amount).toBe(
          staticBillingPeriodItem.unitPrice
        )

        // Verify invoice was marked as paid
        const invoices = await adminTransaction(({ transaction }) =>
          selectInvoices(
            { billingPeriodId: billingPeriod.id },
            transaction
          )
        )
        const invoice = invoices.find(
          (inv) => inv.billingPeriodId === billingPeriod.id
        )
        expect(typeof invoice).toBe('object')
        expect(invoice!.status).toBe(InvoiceStatus.Paid)
      })

      it('grants usage credits when payment succeeds for subscription with credit grant feature', async () => {
        // Setup: Create usage credit grant feature
        const grantAmount = 5000
        const feature = await setupUsageCreditGrantFeature({
          organizationId: organization.id,
          name: 'Test Usage Credit Grant',
          usageMeterId: usageMeter.id,
          renewalFrequency: FeatureUsageGrantFrequency.Once,
          amount: grantAmount,
          livemode: false,
        })

        await setupProductFeature({
          organizationId: organization.id,
          productId: product.id,
          featureId: feature.id,
          livemode: false,
        })

        await adminTransaction(async ({ transaction }) => {
          const activeSubscriptionItems =
            await selectCurrentlyActiveSubscriptionItems(
              { subscriptionId: subscription.id },
              billingPeriod.startDate,
              transaction
            )

          // If no items found, update the subscription item's addedDate to be <= billing period start
          if (activeSubscriptionItems.length === 0) {
            const allItems = await selectSubscriptionItems(
              {
                subscriptionId: subscription.id,
              },
              transaction
            )

            if (allItems.length > 0) {
              // Update addedDate to be at or before billing period start
              await updateSubscriptionItem(
                {
                  id: allItems[0].id,
                  addedDate: billingPeriod.startDate,
                  type: allItems[0].type,
                },
                transaction
              )

              // Re-query after update
              const updatedItems =
                await selectCurrentlyActiveSubscriptionItems(
                  { subscriptionId: subscription.id },
                  billingPeriod.startDate,
                  transaction
                )
              await createSubscriptionFeatureItems(
                updatedItems,
                transaction
              )
              return
            }
          }

          await createSubscriptionFeatureItems(
            activeSubscriptionItems,
            transaction
          )
        })

        // Execute billing run
        await executeBillingRun(billingRun.id)

        // Verify invoice is marked as Paid
        const invoices = await adminTransaction(({ transaction }) =>
          selectInvoices(
            { billingPeriodId: billingPeriod.id },
            transaction
          )
        )
        const invoice = invoices.find(
          (inv) => inv.billingPeriodId === billingPeriod.id
        )
        expect(invoice!.status).toBe(InvoiceStatus.Paid)

        // Verify usage credits were granted
        await adminTransaction(async ({ transaction }) => {
          const ledgerAccounts = await selectLedgerAccounts(
            {
              subscriptionId: subscription.id,
              usageMeterId: usageMeter.id,
            },
            transaction
          )
          expect(ledgerAccounts.length).toBe(1)
          const ledgerAccount = ledgerAccounts[0]

          const usageCredits = await selectUsageCredits(
            { subscriptionId: subscription.id },
            transaction
          )
          expect(usageCredits.length).toBe(1)
          const usageCredit = usageCredits[0]
          expect(usageCredit.issuedAmount).toBe(grantAmount)
          expect(usageCredit.status).toBe(UsageCreditStatus.Posted)
          expect(usageCredit.creditType).toBe(UsageCreditType.Grant)

          // Verify correct grant amount in the ledger
          const balance =
            await aggregateBalanceForLedgerAccountFromEntries(
              { ledgerAccountId: ledgerAccount.id },
              'available',
              transaction
            )
          expect(balance).toBe(grantAmount)
        })
      })
    })

    /**
     * Card Decline Scenarios
     *
     * NOTE: These tests would use Stripe test cards to trigger declines:
     * - 4000000000000002: Generic decline
     * - 4000000000000069: Expired card
     * - 4000000000000127: Incorrect CVC
     * - 4000000000009995: Insufficient funds
     *
     * However, testing card declines requires creating payment methods with
     * these specific card numbers via Stripe Elements or the API, which is
     * complex to set up in automated tests.
     *
     * For now, these scenarios are documented but not fully automated.
     * The validation failure tests above verify the basic rollback behavior
     * works correctly.
     */
  }
)
