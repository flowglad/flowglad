import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  CountryCode,
  CurrencyCode,
  FeatureUsageGrantFrequency,
  IntervalUnit,
  InvoiceStatus,
  InvoiceType,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionType,
  PaymentMethodType,
  PaymentStatus,
  PriceType,
  StripeConnectContractType,
  SubscriptionItemType,
  SubscriptionStatus,
  UsageCreditStatus,
  UsageCreditType,
} from '@db-core/enums'
import type { BillingPeriodItem } from '@db-core/schema/billingPeriodItems'
import type { BillingPeriod } from '@db-core/schema/billingPeriods'
import {
  type BillingRun,
  billingRuns,
  billingRunsInsertSchema,
  billingRunsSelectSchema,
} from '@db-core/schema/billingRuns'
import type { Customer } from '@db-core/schema/customers'
import type { InvoiceLineItem } from '@db-core/schema/invoiceLineItems'
import type { Invoice } from '@db-core/schema/invoices'
import type { LedgerAccount } from '@db-core/schema/ledgerAccounts'
import type { Organization } from '@db-core/schema/organizations'
import type { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { Price } from '@db-core/schema/prices'
import type { PricingModel } from '@db-core/schema/pricingModels'
import type { Product } from '@db-core/schema/products'
import type { SubscriptionItem } from '@db-core/schema/subscriptionItems'
import type { Subscription } from '@db-core/schema/subscriptions'
import type { UsageMeter } from '@db-core/schema/usageMeters'
import { Result } from 'better-result'
import {
  setupBillingPeriod,
  setupBillingPeriodItem,
  setupBillingRun,
  setupCustomer,
  setupDebitLedgerEntry,
  setupInvoice,
  setupLedgerAccount,
  setupLedgerTransaction,
  setupOrg,
  setupPayment,
  setupPaymentMethod,
  setupPrice,
  setupSubscription,
  setupSubscriptionItem,
  setupUsageEvent,
  setupUsageMeter,
  teardownOrg,
} from '@/../seedDatabase'
import {
  adminTransaction,
  adminTransactionWithResult,
} from '@/db/adminTransaction'
import { type OutstandingUsageCostAggregation } from '@/db/ledgerManager/ledgerManagerTypes'
import {
  selectBillingPeriodItems,
  updateBillingPeriodItem,
} from '@/db/tableMethods/billingPeriodItemMethods'
import { updateBillingPeriod } from '@/db/tableMethods/billingPeriodMethods'
import {
  safelyInsertBillingRun,
  selectBillingRunById,
  updateBillingRun,
} from '@/db/tableMethods/billingRunMethods'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
import {
  insertInvoiceLineItems,
  selectInvoiceLineItems,
} from '@/db/tableMethods/invoiceLineItemMethods'
import {
  selectInvoiceById,
  selectInvoices,
} from '@/db/tableMethods/invoiceMethods'
import { selectLedgerAccounts } from '@/db/tableMethods/ledgerAccountMethods'
import {
  aggregateBalanceForLedgerAccountFromEntries,
  selectLedgerEntries,
} from '@/db/tableMethods/ledgerEntryMethods'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import {
  safelyUpdatePaymentMethod,
  updatePaymentMethod,
} from '@/db/tableMethods/paymentMethodMethods'
import { selectPayments } from '@/db/tableMethods/paymentMethods'
import {
  selectCurrentlyActiveSubscriptionItems,
  selectSubscriptionItems,
  updateSubscriptionItem,
} from '@/db/tableMethods/subscriptionItemMethods'
import {
  safelyUpdateSubscriptionStatus,
  selectSubscriptionById,
} from '@/db/tableMethods/subscriptionMethods'
import { selectUsageCredits } from '@/db/tableMethods/usageCreditMethods'
import { ValidationError } from '@/errors'
import { createSubscriptionFeatureItems } from '@/subscriptions/subscriptionItemFeatureHelpers'
import core from '@/utils/core'
import { stripeIdFromObjectOrId } from '@/utils/stripe'
import {
  billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts,
  calculateFeeAndTotalAmountDueForBillingPeriod,
  constructBillingRunRetryInsert,
  createBillingRun,
  createInvoiceInsertForBillingRun,
  executeBillingRun,
  executeBillingRunCalculationAndBookkeepingSteps,
  processNoMoreDueForBillingPeriod,
  processOutstandingBalanceForBillingPeriod,
  scheduleBillingRunRetry,
  tabulateOutstandingUsageCosts,
} from './billingRunHelpers'

describe('billingRunHelpers', async () => {
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
  let billingPeriodItems: BillingPeriodItem.Record[]
  let usageMeter: UsageMeter.Record
  let usageBasedPrice: Price.Record
  let usageBillingPeriodItem: BillingPeriodItem.Record
  let invoice: Invoice.Record
  let ledgerAccount: LedgerAccount.Record
  let subscriptionItem: SubscriptionItem.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
    staticPrice = orgData.price

    customer = await setupCustomer({
      organizationId: organization.id,
    })
    paymentMethod = await setupPaymentMethod({
      organizationId: organization.id,
      customerId: customer.id,
    })

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Global Test Usage Meter',
      pricingModelId: pricingModel.id,
      livemode: true,
    })

    usageBasedPrice = await setupPrice({
      name: 'Global Usage Based Price',
      type: PriceType.Usage,
      unitPrice: 15,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
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
    })

    staticBillingPeriodItem = await setupBillingPeriodItem({
      billingPeriodId: billingPeriod.id,
      quantity: 1,
      unitPrice: staticPrice.unitPrice,
      name: staticPrice.name ?? 'Static Item Name',
      type: SubscriptionItemType.Static,
      description: 'Test Description',
    })

    billingPeriodItems = [
      staticBillingPeriodItem,
      // Note: we've removed usageBillingPeriodItem
      // Usage charges come through the usageOverages parameter instead
    ]

    ledgerAccount = await setupLedgerAccount({
      organizationId: organization.id,
      subscriptionId: subscription.id,
      usageMeterId: usageMeter.id,
      livemode: true,
    })
  })

  afterEach(async () => {
    if (organization) {
      await teardownOrg({ organizationId: organization.id })
    }
  })

  describe('Billing Period State Management', () => {
    it('should mark billing period as PastDue when current date is after end date', async () => {
      const billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date(
          subscription.currentBillingPeriodStart! -
            30 * 24 * 60 * 60 * 1000
        ),
        endDate: new Date(
          subscription.currentBillingPeriodEnd! -
            30 * 24 * 60 * 60 * 1000
        ),
        status: BillingPeriodStatus.Active,
      })
      let invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        status: InvoiceStatus.Draft,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })
      const updatedBillingPeriod = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await processOutstandingBalanceForBillingPeriod(
              billingPeriod,
              invoice,
              transaction
            )
          )
        )
      ).unwrap()
      invoice = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            (
              await selectInvoiceById(invoice.id, transaction)
            ).unwrap()
          )
        )
      ).unwrap()

      expect(invoice.status).toBe(InvoiceStatus.Open)
      expect(updatedBillingPeriod.status).toBe(
        BillingPeriodStatus.PastDue
      )
    })

    it('should mark billing period as Completed when all payments are settled', async () => {
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        status: InvoiceStatus.Paid,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })
      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const updatedBillingPeriod = await updateBillingPeriod(
            {
              id: billingPeriod.id,
              endDate: Date.now() - 180 * 1000,
            },
            transaction
          )
          return Result.ok(
            await processNoMoreDueForBillingPeriod(
              {
                billingRun,
                billingPeriod: updatedBillingPeriod,
                invoice,
              },
              transaction
            )
          )
        })
      ).unwrap()
      expect(result.billingPeriod.status).toBe(
        BillingPeriodStatus.Completed
      )
    })
  })

  describe('Payment Intent Creation and Confirmation', () => {
    it('should create a payment intent for the correct amount', async () => {
      const { totalDueAmount } = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await calculateFeeAndTotalAmountDueForBillingPeriod(
              {
                billingPeriod,
                billingPeriodItems,
                organization,
                paymentMethod,
                usageOverages: [],
                billingRun,
              },
              transaction
            )
          )
        )
      ).unwrap()
      expect(totalDueAmount).toBeGreaterThan(0)
      // TODO: check the total due amount is correct
    })

    it('should not create a payment intent if the invoice is in a terminal state', async () => {
      await setupInvoice({
        billingPeriodId: billingPeriod.id,
        status: InvoiceStatus.Paid,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })
      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()
      expect(result.invoice.status).toBe(InvoiceStatus.Paid)
    })
  })

  describe('Fee Calculation and Total Due Amount', () => {
    it('should calculate the correct fee and total due amount', async () => {
      const { feeCalculation, totalDueAmount } = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await calculateFeeAndTotalAmountDueForBillingPeriod(
              {
                billingPeriod,
                billingPeriodItems,
                organization,
                paymentMethod,
                usageOverages: [],
                billingRun,
              },
              transaction
            )
          )
        )
      ).unwrap()
      expect(typeof feeCalculation).toBe('object')
      expect(totalDueAmount).toBeGreaterThan(0)
    })

    it('should handle different currencies correctly', async () => {
      // Create an organization with a different default currency
      const originalOrg = await setupOrg()
      const orgWithDifferentCurrency = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await updateOrganization(
              {
                id: originalOrg.organization.id,
                defaultCurrency: CurrencyCode.EUR,
              },
              transaction
            )
          )
        })
      ).unwrap()

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await calculateFeeAndTotalAmountDueForBillingPeriod(
              {
                billingPeriod,
                billingPeriodItems,
                organization: orgWithDifferentCurrency,
                paymentMethod,
                usageOverages: [],
                billingRun,
              },
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.feeCalculation).toMatchObject({})
      expect(result.feeCalculation.currency).toBe(CurrencyCode.EUR)
    })

    it('should handle different billing period items correctly', async () => {
      // Create billing period items with different prices and quantities
      const testBillingPeriodItem = await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 2,
        unitPrice: 150,
      })

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await calculateFeeAndTotalAmountDueForBillingPeriod(
              {
                billingPeriod,
                billingPeriodItems: [testBillingPeriodItem],
                organization,
                paymentMethod,
                usageOverages: [],
                billingRun,
              },
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.totalDueAmount).toBe(300) // 2 * 150
    })

    it('should handle livemode correctly', async () => {
      // Create a test billing period with a specific livemode value
      const testBillingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: subscription.currentBillingPeriodStart!,
        endDate: subscription.currentBillingPeriodEnd!,
        status: BillingPeriodStatus.Active,
        livemode: true, // Set to true for testing
      })

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await calculateFeeAndTotalAmountDueForBillingPeriod(
              {
                billingPeriod: testBillingPeriod,
                billingPeriodItems,
                organization,
                paymentMethod,
                usageOverages: [],
                billingRun,
              },
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.feeCalculation).toMatchObject({})
      expect(result.feeCalculation.livemode).toBe(true)
    })

    it('should handle different payment methods correctly', async () => {
      // Create a different payment method
      const testPaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        type: PaymentMethodType.Card,
      })

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await calculateFeeAndTotalAmountDueForBillingPeriod(
              {
                billingPeriod,
                billingPeriodItems,
                organization,
                paymentMethod: testPaymentMethod,
                usageOverages: [],
                billingRun,
              },
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.feeCalculation).toMatchObject({})
      expect(result.feeCalculation.paymentMethodType).toBe(
        testPaymentMethod.type
      )
    })
  })

  describe('Invoice Creation and Line Items', () => {
    it('should create an invoice with the correct invoice number', async () => {
      const invoiceInsert = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await createInvoiceInsertForBillingRun(
              {
                billingPeriod,
                organization,
                customer,
                currency: staticPrice.currency,
              },
              transaction
            )
          )
        )
      ).unwrap()
      expect(typeof invoiceInsert.invoiceNumber).toBe('string')
      expect(invoiceInsert.invoiceNumber.length).toBeGreaterThan(0)
    })

    it('should generate invoice line items from billing period items, ommiting items with 0 quantity', async () => {
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })
      const zeroQuantityBillingPeriodItem = {
        ...staticBillingPeriodItem,
        quantity: 0,
      }
      const lineItems =
        billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts({
          invoiceId: invoice.id,
          billingPeriodItems: [
            staticBillingPeriodItem,
            zeroQuantityBillingPeriodItem,
          ],
          usageOverages: [],
          billingRunId: billingRun.id,
        })
      expect(lineItems.length).toBe(1)
    })
  })

  describe('createInvoiceInsertForBillingRun', () => {
    it('should create an invoice with the correct properties', async () => {
      const invoiceInsert = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await createInvoiceInsertForBillingRun(
              {
                billingPeriod,
                organization,
                customer,
                currency: staticPrice.currency,
              },
              transaction
            )
          )
        )
      ).unwrap()

      // Check all required properties are set correctly
      expect(invoiceInsert.customerId).toBe(customer.id)
      expect(invoiceInsert.organizationId).toBe(organization.id)
      expect(invoiceInsert.currency).toBe(staticPrice.currency)
      expect(invoiceInsert.livemode).toBe(billingPeriod.livemode)
      expect(invoiceInsert.status).toBe(InvoiceStatus.Draft)
      expect(invoiceInsert.type).toBe(InvoiceType.Subscription)
      expect(invoiceInsert.billingPeriodId).toBe(billingPeriod.id)
      expect(invoiceInsert.subscriptionId).toBe(
        billingPeriod.subscriptionId
      )
      expect(invoiceInsert.purchaseId).toBeNull()

      // Check dates are set
      expect(typeof invoiceInsert.invoiceDate).toBe('number')
      expect(invoiceInsert.invoiceDate).toBeGreaterThan(0)
      expect(typeof invoiceInsert.dueDate).toBe('number')
      expect(invoiceInsert.dueDate).toBeGreaterThan(0)
      expect(invoiceInsert.billingPeriodStartDate).toEqual(
        billingPeriod.startDate
      )
      expect(invoiceInsert.billingPeriodEndDate).toEqual(
        billingPeriod.endDate
      )
    })

    it('should generate invoice number based on customer invoice number base and count', async () => {
      // Create a customer with a specific invoice number base
      const invoiceNumberBase = `TEST-${core.nanoid()}`
      const testCustomer = await setupCustomer({
        organizationId: organization.id,
        invoiceNumberBase,
      })

      // Create some existing invoices for this customer
      await setupInvoice({
        customerId: testCustomer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })
      await setupInvoice({
        customerId: testCustomer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })

      const invoiceInsert = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await createInvoiceInsertForBillingRun(
              {
                billingPeriod,
                organization,
                customer: testCustomer,
                currency: staticPrice.currency,
              },
              transaction
            )
          )
        )
      ).unwrap()

      // The invoice number should be based on the customer's invoice number base and the count of existing invoices
      expect(invoiceInsert.invoiceNumber).toContain(invoiceNumberBase)
      expect(invoiceInsert.invoiceNumber).toContain('2') // Should be the 3rd invoice (index 2)
    })

    it('should handle different currencies', async () => {
      const testCurrency = CurrencyCode.EUR

      const invoiceInsert = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await createInvoiceInsertForBillingRun(
              {
                billingPeriod,
                organization,
                customer,
                currency: testCurrency,
              },
              transaction
            )
          )
        )
      ).unwrap()

      expect(invoiceInsert.currency).toBe(testCurrency)
    })

    it('should set the correct livemode value from the billing period', async () => {
      // Create a test billing period with a specific livemode value
      const testBillingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: subscription.currentBillingPeriodStart!,
        endDate: subscription.currentBillingPeriodEnd!,
        status: BillingPeriodStatus.Active,
        livemode: true, // Set to true for testing
      })

      const invoiceInsert = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await createInvoiceInsertForBillingRun(
              {
                billingPeriod: testBillingPeriod,
                organization,
                customer,
                currency: staticPrice.currency,
              },
              transaction
            )
          )
        )
      ).unwrap()

      expect(invoiceInsert.livemode).toBe(true)
    })

    it('should set the correct billing period dates', async () => {
      // Create a test billing period with specific dates
      const startDate = new Date('2023-01-01')
      const endDate = new Date('2023-01-31')

      const testBillingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate,
        endDate,
        status: BillingPeriodStatus.Active,
      })

      const invoiceInsert = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await createInvoiceInsertForBillingRun(
              {
                billingPeriod: testBillingPeriod,
                organization,
                customer,
                currency: staticPrice.currency,
              },
              transaction
            )
          )
        )
      ).unwrap()

      expect(invoiceInsert.billingPeriodStartDate).toEqual(
        startDate.getTime()
      )
      expect(invoiceInsert.billingPeriodEndDate).toEqual(
        endDate.getTime()
      )
    })
  })

  describe('calculateFeeAndTotalAmountDueForBillingPeriod', () => {
    let invoice: Invoice.Record

    beforeEach(async () => {
      invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
        status: InvoiceStatus.Draft,
      })
    })

    it('should calculate fee and total due correctly, ommitting billing period items that do not have any usage attached to them ', async () => {
      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await calculateFeeAndTotalAmountDueForBillingPeriod(
              {
                billingPeriod,
                billingPeriodItems,
                organization,
                paymentMethod,
                usageOverages: [],
                billingRun,
              },
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.feeCalculation).toMatchObject({})
      expect(result.totalDueAmount).toBeGreaterThan(0)

      expect(result.totalDueAmount).toBe(
        billingPeriodItems.reduce(
          (acc, item) => acc + item.unitPrice * item.quantity,
          0
        )
      )
    })

    it('should handle different currencies correctly', async () => {
      // Create an organization with a different default currency
      const originalOrg = await setupOrg()
      const orgWithDifferentCurrency = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await updateOrganization(
              {
                id: originalOrg.organization.id,
                defaultCurrency: CurrencyCode.EUR,
              },
              transaction
            )
          )
        })
      ).unwrap()

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await calculateFeeAndTotalAmountDueForBillingPeriod(
              {
                billingPeriod,
                billingPeriodItems,
                organization: orgWithDifferentCurrency,
                paymentMethod,
                usageOverages: [],
                billingRun,
              },
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.feeCalculation).toMatchObject({})
      expect(result.feeCalculation.currency).toBe(CurrencyCode.EUR)
    })

    it('should handle different billing period items correctly', async () => {
      // Create billing period items with different prices and quantities
      const testBillingPeriodItem = await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 2,
        unitPrice: 150,
      })

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await calculateFeeAndTotalAmountDueForBillingPeriod(
              {
                billingPeriod,
                billingPeriodItems: [testBillingPeriodItem],
                organization,
                paymentMethod,
                usageOverages: [],
                billingRun,
              },
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.totalDueAmount).toBe(300) // 2 * 150
    })

    it('should handle livemode correctly', async () => {
      // Create a test billing period with a specific livemode value
      const testBillingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: subscription.currentBillingPeriodStart!,
        endDate: subscription.currentBillingPeriodEnd!,
        status: BillingPeriodStatus.Active,
        livemode: true, // Set to true for testing
      })

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await calculateFeeAndTotalAmountDueForBillingPeriod(
              {
                billingPeriod: testBillingPeriod,
                billingPeriodItems,
                organization,
                paymentMethod,
                usageOverages: [],
                billingRun,
              },
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.feeCalculation).toMatchObject({})
      expect(result.feeCalculation.livemode).toBe(true)
    })

    it('should handle different payment methods correctly', async () => {
      // Create a different payment method
      const testPaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        type: PaymentMethodType.Card,
      })

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await calculateFeeAndTotalAmountDueForBillingPeriod(
              {
                billingPeriod,
                billingPeriodItems,
                organization,
                paymentMethod: testPaymentMethod,
                usageOverages: [],
                billingRun,
              },
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.feeCalculation).toMatchObject({})
      expect(result.feeCalculation.paymentMethodType).toBe(
        testPaymentMethod.type
      )
    })
  })

  describe('Billing Run Retry Logic', () => {
    it('should schedule billing run retries according to the defined schedule', async () => {
      const retryTimesInDays = [3, 5, 5]
      let currentBillingRun: BillingRun.Record = billingRun

      for (let i = 0; i < retryTimesInDays.length; i++) {
        const daysToRetry = retryTimesInDays[i]
        const retryInsert =
          constructBillingRunRetryInsert(currentBillingRun)

        expect(typeof retryInsert).toBe('object')
        const expectedRetryDate =
          Date.now() + daysToRetry * 24 * 60 * 60 * 1000
        expect(retryInsert!.scheduledFor).toBeCloseTo(
          expectedRetryDate,
          -3 // tolerance of 1 second
        )

        // Use the retry run for the next iteration
        currentBillingRun = {
          ...currentBillingRun,
          ...(retryInsert as BillingRun.Insert),
          id: `retry-run-${i}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: retryInsert!.status,
          attemptNumber: retryInsert!.attemptNumber,
        } as BillingRun.Record
      }
    })

    it('should schedule a billing run retry 3 days after the initial attempt', async () => {
      const retryBillingRunResult = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(scheduleBillingRunRetry(billingRun, transaction))
        )
      ).unwrap()
      const retryBillingRun = retryBillingRunResult?.unwrap()
      expect(typeof retryBillingRun).toBe('object')
      expect(retryBillingRun?.scheduledFor).toBeGreaterThan(
        Date.now() + 3 * 24 * 60 * 60 * 1000 - 60 * 1000
      )
    })

    it('should mark a future billing period as Upcoming when there is no more due', async () => {
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        status: InvoiceStatus.Paid,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })
      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const futureBillingPeriod = await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() + 10 * 24 * 60 * 60 * 1000, // 10 days in the future
            },
            transaction
          )
          return Result.ok(
            await processNoMoreDueForBillingPeriod(
              {
                billingRun,
                billingPeriod: futureBillingPeriod,
                invoice,
              },
              transaction
            )
          )
        })
      ).unwrap()
      expect(result.billingPeriod.status).toBe(
        BillingPeriodStatus.Upcoming
      )
    })

    it('returns ValidationError when trying to create a retry billing run for a canceled subscription', async () => {
      // Update the subscription status to canceled
      const canceledSubscription = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await safelyUpdateSubscriptionStatus(
              subscription,
              SubscriptionStatus.Canceled,
              transaction
            )
          )
        })
      ).unwrap()

      // The database-level protection should return a ValidationError
      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(scheduleBillingRunRetry(billingRun, transaction))
        )
      ).unwrap()
      if (!result) {
        throw new Error('Expected result to be defined')
      }
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error).toBeInstanceOf(ValidationError)
        expect(result.error.message).toBe(
          'Invalid subscription: Cannot create billing run for canceled subscription'
        )
      }
    })

    it('should schedule a retry billing run if the subscription is not canceled', async () => {
      // Ensure the subscription is active
      const activeSubscription = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await safelyUpdateSubscriptionStatus(
              subscription,
              SubscriptionStatus.Active,
              transaction
            )
          )
        })
      ).unwrap()

      const retryBillingRunResult = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(scheduleBillingRunRetry(billingRun, transaction))
        )
      ).unwrap()
      const retryBillingRun = retryBillingRunResult?.unwrap()

      expect(retryBillingRun).toMatchObject({
        status: BillingRunStatus.Scheduled,
      })
      expect(retryBillingRun?.status).toBe(BillingRunStatus.Scheduled)
      expect(retryBillingRun?.subscriptionId).toBe(subscription.id)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should throw an error if the customer does not have a Stripe customer ID', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateCustomer(
            {
              id: customer.id,
              stripeCustomerId: null,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()
      await executeBillingRun(billingRun.id)
      const updatedBillingRun = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await selectBillingRunById(
              billingRun.id,
              transaction
            ).then((r) => r.unwrap())
          )
        )
      ).unwrap()
      expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)
    })

    it('should throw an error if the payment method does not have a Stripe payment method ID', async () => {
      ;(
        await adminTransactionWithResult(
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
            return Result.ok(undefined)
          }
        )
      ).unwrap()
      await executeBillingRun(billingRun.id)
      const updatedBillingRun = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await selectBillingRunById(
              billingRun.id,
              transaction
            ).then((r) => r.unwrap())
          )
        )
      ).unwrap()
      expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)
    })
  })
  it('should silently return when trying to execute a billing run that is not in Scheduled status', async () => {
    // Test each billing run status
    const billingRunStatuses = Object.values(BillingRunStatus).filter(
      (status) => status !== BillingRunStatus.Scheduled
    )

    for (const status of billingRunStatuses) {
      const testBillingRun = await setupBillingRun({
        status,
        livemode: false,
        billingPeriodId: billingPeriod.id,
        paymentMethodId: paymentMethod.id,
        subscriptionId: subscription.id,
      })

      await expect(
        executeBillingRun(testBillingRun.id)
      ).resolves.toBeUndefined()
    }
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        await updateBillingRun(
          {
            id: billingRun.id,
            status: BillingRunStatus.Failed,
          },
          transaction
        )
        return Result.ok(undefined)
      })
    ).unwrap()

    await expect(
      executeBillingRun(billingRun.id)
    ).resolves.toBeUndefined()
  })

  // NOTE: Atomicity tests for executeBillingRun have been moved to
  // billingRunHelpers.integration.test.ts because they require controlling
  // Stripe behavior (failures, card declines) that stripe-mock cannot simulate.
  // Run with: bun run test:integration src/subscriptions/billingRunHelpers.integration.test.ts

  describe('executeBillingRunCalculationAndBookkeepingSteps', () => {
    it('should create a new invoice when none exists for the billing period', async () => {
      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.invoice.id).toMatch(/^inv_/)
      expect(result.invoice.billingPeriodId).toBe(billingPeriod.id)
      expect(result.invoice.customerId).toBe(customer.id)
      expect(result.invoice.organizationId).toBe(organization.id)
      expect(typeof result.invoice.currency).toBe('string')
    })

    it('should use existing invoice when one exists for the billing period', async () => {
      // Create an invoice first
      const existingInvoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.invoice.id).toBe(existingInvoice.id)
    })

    it('should handle zero amount due correctly', async () => {
      // Create billing period items with zero price
      await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 0,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateBillingPeriodItem(
            {
              ...staticBillingPeriodItem,
              unitPrice: 0,
              quantity: 1,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()
      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      // Check the billing run status after the function call
      const { updatedBillingRun } = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const updatedBillingRun = (
            await selectBillingRunById(billingRun.id, transaction)
          ).unwrap()
          return Result.ok({ updatedBillingRun })
        })
      ).unwrap()
      expect(result.invoice.status).toBe(InvoiceStatus.Paid)
      // expect(result.billingPeriod.status).toBe(
      //   BillingPeriodStatus.Completed
      // )
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )
    })
    it('should handle terminal invoice state correctly', async () => {
      // Create an invoice in a terminal state
      const paidInvoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
        status: InvoiceStatus.Paid,
      })

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.invoice.id).toBe(paidInvoice.id)
      expect(result.invoice.status).toBe(InvoiceStatus.Paid)
      expect(result.payment).toBeUndefined()

      // Check the billing run status after the function call
      const updatedBillingRun = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await selectBillingRunById(
              billingRun.id,
              transaction
            ).then((r) => r.unwrap())
          )
        )
      ).unwrap()
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )
    })

    it('should delete and recreate invoice line items', async () => {
      // Create an invoice with line items
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })

      // Create some initial line items
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const initialLineItems =
            billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts(
              {
                invoiceId: invoice.id,
                billingPeriodItems: [
                  {
                    ...billingPeriodItems[0],
                    unitPrice: 50, // Different price to verify recreation
                  },
                ],
                usageOverages: [],
                billingRunId: billingRun.id,
              }
            )
          await insertInvoiceLineItems(initialLineItems, transaction)
          return Result.ok(undefined)
        })
      ).unwrap()

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      // Verify the line items were recreated with the correct price
      expect(result.invoice.id).toBe(invoice.id)
      // We can't directly check the line items here, but we can verify the payment amount
      // reflects the correct price from billingPeriodItems
      if (result.payment) {
        expect(result.payment.amount).toBe(
          billingPeriodItems[0].unitPrice
        )
      }
    })

    it('should create payment with correct properties', async () => {
      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.payment).toMatchObject({})
      if (result.payment) {
        expect(result.payment.subscriptionId).toBe(
          billingPeriod.subscriptionId
        )
        expect(result.payment.billingPeriodId).toBe(billingPeriod.id)
        // Payment amount should be the actual amount to charge (totalDueAmount - totalAmountPaid),
        // not the full totalDueAmount. This ensures the payment record matches what Stripe charges.
        expect(result.payment.amount).toBe(result.amountToCharge)
        expect(result.payment.currency).toBe(result.invoice.currency)
        expect(result.payment.paymentMethodId).toBe(
          billingRun.paymentMethodId
        )
        expect(result.payment.organizationId).toBe(organization.id)
        expect(result.payment.customerId).toBe(customer.id)
        expect(result.payment.invoiceId).toBe(result.invoice.id)
        expect(typeof result.payment.taxCountry).toBe('string')
        expect(result.payment.paymentMethod).toBe(paymentMethod.type)
        expect(result.payment.stripePaymentIntentId).toContain(
          'placeholder____'
        )
        expect(result.payment.livemode).toBe(billingPeriod.livemode)
      }
    })

    it('copies Stripe Tax calculation fields from fee calculation onto payment (MoR)', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          organization = await updateOrganization(
            {
              id: organization.id,
              stripeConnectContractType:
                StripeConnectContractType.MerchantOfRecord,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.feeCalculation.stripeTaxCalculationId).toMatch(
        /^testtaxcalc_/
      )
      expect(result.payment?.stripeTaxCalculationId).toBe(
        result.feeCalculation.stripeTaxCalculationId
      )
      expect(result.payment?.subtotal).toBe(
        result.feeCalculation.pretaxTotal
      )
      expect(result.payment?.taxAmount).toBe(
        result.feeCalculation.taxAmountFixed
      )
      expect(result.payment?.stripeTaxTransactionId).toBe(
        result.feeCalculation.stripeTaxTransactionId
      )
    })

    it('should update billing run status to AwaitingPaymentConfirmation', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      // Check the billing run status after the function call
      const updatedBillingRun = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await selectBillingRunById(
              billingRun.id,
              transaction
            ).then((r) => r.unwrap())
          )
        )
      ).unwrap()
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.AwaitingPaymentConfirmation
      )
    })

    it('should update billing run status to Succeeded when no payment needed', async () => {
      // Create billing period items with zero price
      await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 0,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateBillingPeriodItem(
            {
              ...staticBillingPeriodItem,
              unitPrice: 0,
              quantity: 1,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      ;(
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      // Check the billing run status after the function call
      const updatedBillingRun = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await selectBillingRunById(
              billingRun.id,
              transaction
            ).then((r) => r.unwrap())
          )
        )
      ).unwrap()
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )
    })

    it('should update billing period status based on invoice status and date', async () => {
      // Create an invoice in a terminal state
      await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
        status: InvoiceStatus.Paid,
      })

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      // If the billing period is in the past, it should be marked as Completed
      if (Date.now() > billingPeriod.endDate) {
        expect(result.billingPeriod.status).toBe(
          BillingPeriodStatus.Completed
        )
      }
    })

    it('should create fee calculation with correct properties', async () => {
      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.feeCalculation.id).toMatch(/^feec_/)
      expect(typeof result.feeCalculation.currency).toBe('string')
    })

    it('should return all expected properties in the result object', async () => {
      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.invoice.id).toMatch(/^inv_/)
      expect(result.payment!.id).toMatch(/^pym_/)
      expect(result.feeCalculation.id).toMatch(/^feec_/)
      expect(result.customer.id).toMatch(/^cust_/)
      expect(result.organization.id).toMatch(/^org_/)
      expect(result.billingPeriod.id).toMatch(/^billing_period_/)
      expect(result.subscription.id).toMatch(/^sub_/)
      expect(result.paymentMethod.id).toMatch(/^pm_/)
      expect(typeof result.totalDueAmount).toBe('number')
      expect(typeof result.totalAmountPaid).toBe('number')
      expect(Array.isArray(result.payments)).toBe(true)
    })

    it('should handle nested billing details address for tax country', async () => {
      const billingAddress: PaymentMethod.BillingDetails =
        paymentMethod
          .billingDetails(
            // Update payment method with nested address
            await adminTransactionWithResult(
              async ({ transaction }) => {
                await updatePaymentMethod(
                  {
                    id: paymentMethod.id,
                    billingDetails: {
                      ...billingAddress,
                      address: {
                        country: 'US',
                        line1: null,
                        line2: null,
                        city: null,
                        state: null,
                        postal_code: null,
                      },
                    },
                  },
                  transaction
                )
                return Result.ok(undefined)
              }
            )
          )
          .unwrap()

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      if (result.payment) {
        expect(result.payment.taxCountry).toBe(CountryCode.US)
      }
    })

    it('should handle non-nested billing details address for tax country', async () => {
      // Update payment method with non-nested address
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updatePaymentMethod(
            {
              id: paymentMethod.id,
              billingDetails: {
                name: 'Test Name',
                email: 'test@test.com',
                address: {
                  country: 'CA',
                  line1: null,
                  line2: null,
                  city: null,
                  state: null,
                  postal_code: null,
                },
              },
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      if (result.payment) {
        expect(result.payment.taxCountry).toBe(CountryCode.CA)
      }
    })

    it('should handle multiple payments for billing period', async () => {
      // Create a payment for the billing period
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })

      await setupPayment({
        stripeChargeId: 'ch_test_123' + core.nanoid(),
        status: PaymentStatus.Succeeded,
        amount: 50,
        livemode: billingPeriod.livemode,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: 'pi_test' + core.nanoid(),
        invoiceId: invoice.id,
        paymentMethod: paymentMethod.type,
        billingPeriodId: billingPeriod.id,
        subscriptionId: billingPeriod.subscriptionId,
        paymentMethodId: paymentMethod.id,
      })

      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      expect(result.totalAmountPaid).toBe(50)
      expect(result.payments.length).toBeGreaterThan(0)
    })

    it('payment.amount equals amountToCharge (not totalDueAmount) when existing payments reduce amount owed', async () => {
      // Setup: Create a billing period item with a known price
      const knownPrice = 10000 // $100 in cents
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateBillingPeriodItem(
            {
              id: staticBillingPeriodItem.id,
              unitPrice: knownPrice,
              type: SubscriptionItemType.Static,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      // Create an existing payment of $50 for this billing period
      const existingPaymentAmount = 5000 // $50 in cents
      const testInvoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })

      await setupPayment({
        stripeChargeId: 'ch_existing_' + core.nanoid(),
        status: PaymentStatus.Succeeded,
        amount: existingPaymentAmount,
        livemode: billingPeriod.livemode,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: 'pi_existing_' + core.nanoid(),
        invoiceId: testInvoice.id,
        paymentMethod: paymentMethod.type,
        billingPeriodId: billingPeriod.id,
        subscriptionId: billingPeriod.subscriptionId,
        paymentMethodId: paymentMethod.id,
      })

      // Execute the billing run
      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      // Verify the amounts are calculated correctly
      expect(result.totalAmountPaid).toBe(existingPaymentAmount)
      expect(result.amountToCharge).toBe(
        result.totalDueAmount - result.totalAmountPaid
      )

      // The payment record must store amountToCharge, not totalDueAmount
      // This is critical because:
      // 1. Stripe will only charge amountToCharge
      // 2. Refund logic uses payment.amount to validate max refundable
      // 3. Revenue reporting sums payment.amount
      expect(result.payment).toMatchObject({
        amount: result.amountToCharge,
      })
      expect(result.payment!.amount).toBe(result.amountToCharge)
      expect(result.payment!.amount).not.toBe(result.totalDueAmount)
      expect(result.payment!.amount).toBeLessThan(
        result.totalDueAmount
      )
    })

    it('does not create a payment record when amountToCharge is 0 due to existing payments fully covering totalDueAmount', async () => {
      // Setup: Create a billing period item with a known price
      const knownPrice = 10000 // $100 in cents
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateBillingPeriodItem(
            {
              id: staticBillingPeriodItem.id,
              unitPrice: knownPrice,
              type: SubscriptionItemType.Static,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      // Create an invoice for this billing period
      const testInvoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })

      // Create an existing payment that FULLY covers the totalDueAmount
      // This simulates the scenario from issue #1317 where prior payments
      // have already covered the full amount
      await setupPayment({
        stripeChargeId: 'ch_fullcover_' + core.nanoid(),
        status: PaymentStatus.Succeeded,
        amount: knownPrice, // Full amount - should result in amountToCharge = 0
        livemode: billingPeriod.livemode,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: 'pi_fullcover_' + core.nanoid(),
        invoiceId: testInvoice.id,
        paymentMethod: paymentMethod.type,
        billingPeriodId: billingPeriod.id,
        subscriptionId: billingPeriod.subscriptionId,
        paymentMethodId: paymentMethod.id,
      })

      // Execute the billing run
      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      // Verify the scenario: totalDueAmount > 0 but amountToCharge = 0
      expect(result.totalDueAmount).toBeGreaterThan(0)
      expect(result.totalAmountPaid).toBe(knownPrice)
      expect(result.amountToCharge).toBe(0)

      // The fix: no payment record should be created when amountToCharge is 0
      // Previously this would create an orphaned $0 payment with status: Processing
      expect(result.payment).toBeUndefined()

      // Verify the invoice is marked as paid
      expect(result.invoice.status).toBe(InvoiceStatus.Paid)

      // Verify the billing run is marked as succeeded
      const updatedBillingRun = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await selectBillingRunById(
              billingRun.id,
              transaction
            ).then((r) => r.unwrap())
          )
        )
      ).unwrap()
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )
    })

    it('succeeds without Stripe IDs when amountToCharge is 0 (prior payments fully cover amount)', async () => {
      // Setup: Create a billing period item with a known price
      const knownPrice = 10000 // $100 in cents
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateBillingPeriodItem(
            {
              id: staticBillingPeriodItem.id,
              unitPrice: knownPrice,
              type: SubscriptionItemType.Static,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      // Create an invoice for this billing period
      const testInvoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })

      // Create an existing payment that FULLY covers the totalDueAmount
      await setupPayment({
        stripeChargeId: 'ch_fullcover_nostripe_' + core.nanoid(),
        status: PaymentStatus.Succeeded,
        amount: knownPrice, // Full amount - should result in amountToCharge = 0
        livemode: billingPeriod.livemode,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId:
          'pi_fullcover_nostripe_' + core.nanoid(),
        invoiceId: testInvoice.id,
        paymentMethod: paymentMethod.type,
        billingPeriodId: billingPeriod.id,
        subscriptionId: billingPeriod.subscriptionId,
        paymentMethodId: paymentMethod.id,
      })

      // Remove Stripe IDs - this should NOT cause failure when amountToCharge is 0
      // This is the key difference from the previous test: we're verifying that
      // the amountToCharge <= 0 guard comes BEFORE Stripe ID validation
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updatePaymentMethod(
            {
              id: paymentMethod.id,
              stripePaymentMethodId: null,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      // Execute the billing run - should succeed, not throw
      const result = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      // Verify the scenario worked correctly
      expect(result.totalDueAmount).toBeGreaterThan(0)
      expect(result.amountToCharge).toBe(0)
      expect(result.payment).toBeUndefined()
      expect(result.invoice.status).toBe(InvoiceStatus.Paid)

      // Verify the billing run is marked as succeeded
      const updatedBillingRun = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await selectBillingRunById(
              billingRun.id,
              transaction
            ).then((r) => r.unwrap())
          )
        )
      ).unwrap()
      expect(updatedBillingRun.status).toBe(
        BillingRunStatus.Succeeded
      )
    })

    it('should throw an error if customer has no stripe customer ID', async () => {
      // Update customer to remove stripe customer ID
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updateCustomer(
            {
              id: customer.id,
              stripeCustomerId: null,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      await expect(
        adminTransaction(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).rejects.toThrow(
        'Cannot run billing for a billing period with a customer that does not have a stripe customer id'
      )
    })

    it('should throw an error if payment method has no stripe payment method ID', async () => {
      // Update payment method to remove stripe payment method ID
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await updatePaymentMethod(
            {
              id: paymentMethod.id,
              stripePaymentMethodId: null,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      await expect(
        adminTransaction(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).rejects.toThrow(
        'Cannot run billing for a billing period with a payment method that does not have a stripe payment method id'
      )
    })

    it('should claim outstanding usage costs by associating them with the billing run', async () => {
      // 1. Setup: Create a usage event and a debit ledger entry that is "unclaimed"
      const ledgerTransaction = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.UsageEventProcessed,
      })
      const usageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 5,
        priceId: usageBasedPrice.id,
        billingPeriodId: billingPeriod.id,
        transactionId: 'dummy_txn_claim_' + Math.random(),
        customerId: customer.id,
        usageDate: Date.now(),
      })
      const initialEntry = await setupDebitLedgerEntry({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: ledgerTransaction.id,
        ledgerAccountId: ledgerAccount.id,
        amount: 100,
        entryType: LedgerEntryType.UsageCost,
        sourceUsageEventId: usageEvent.id,
        status: LedgerEntryStatus.Posted,
        usageMeterId: usageMeter.id,
        claimedByBillingRunId: null, // Explicitly unclaimed
      })

      // Verify it's picked up by tabulation
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const { rawOutstandingUsageCosts } =
            await tabulateOutstandingUsageCosts(
              subscription.id,
              billingPeriod.endDate,
              transaction
            )
          expect(rawOutstandingUsageCosts.length).toBe(1)
          return Result.ok(undefined)
        })
      ).unwrap()
      // 2. Action
      ;(
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        )
      ).unwrap()

      // 3. Assert: The ledger entry should now be "claimed" by the billing run
      const [updatedEntry] = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            selectLedgerEntries(
              {
                sourceUsageEventId: usageEvent.id,
                entryType: LedgerEntryType.UsageCost,
              },
              transaction
            )
          )
        )
      ).unwrap()
      expect(updatedEntry).toMatchObject({
        claimedByBillingRunId: billingRun.id,
      })
      expect(updatedEntry!.claimedByBillingRunId).toBe(billingRun.id)
    })

    it('should succeed and mark invoice as Paid if amount to charge is zero due to overpayment', async () => {
      // 1. Setup: Create a payment that overpays the due amount.
      // Total due is staticBillingPeriodItem.unitPrice (50)
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })

      await setupPayment({
        stripeChargeId: 'ch_test_123' + core.nanoid(),
        status: PaymentStatus.Succeeded,
        amount: 1000000, // Overpayment
        livemode: billingPeriod.livemode,
        customerId: customer.id,
        organizationId: organization.id,
        stripePaymentIntentId: 'pi_overpayment_test' + core.nanoid(),
        invoiceId: invoice.id,
        paymentMethod: paymentMethod.type,
        billingPeriodId: billingPeriod.id,
        subscriptionId: billingPeriod.subscriptionId,
        paymentMethodId: paymentMethod.id,
      })
      core.IS_TEST = true

      // 2. Action
      await executeBillingRun(billingRun.id)

      // 3. Assert
      const finalBillingRun = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            await selectBillingRunById(
              billingRun.id,
              transaction
            ).then((r) => r.unwrap())
          )
        )
      ).unwrap()
      const finalInvoice = (
        await adminTransactionWithResult(async ({ transaction }) =>
          Result.ok(
            selectInvoices(
              { billingPeriodId: billingPeriod.id },
              transaction
            )
          )
        )
      ).unwrap()[0]

      expect(finalBillingRun.status).toBe(BillingRunStatus.Succeeded)
      expect(finalInvoice.status).toBe(InvoiceStatus.Paid)
    })

    it('should filter out Static items with a zero quantity', () => {
      const staticBpiWithZeroQuantity = {
        ...staticBillingPeriodItem,
        quantity: 0,
      }
      const lineItems =
        billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts({
          invoiceId: 'some-invoice-id',
          billingRunId: billingRun.id,
          billingPeriodItems: [staticBpiWithZeroQuantity],
          usageOverages: [],
        })
      expect(lineItems.length).toBe(0)
    })

    it('should return quantity 0 if usageEventsPerUnit is null', () => {
      // Test that when usageEventsPerUnit is null in usageOverages, quantity becomes 0
      const usageOverages = [
        {
          usageMeterId: usageMeter.id,
          balance: 100,
          ledgerAccountId: ledgerAccount.id,
          priceId: usageBasedPrice.id,
          usageEventsPerUnit: null as any, // null to test the edge case
          unitPrice: usageBasedPrice.unitPrice,
          livemode: true,
          name: null,
          description: null,
          usageEventId: 'test-usage-event-id',
        },
      ]
      const lineItems =
        billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts({
          invoiceId: 'some-invoice-id',
          billingRunId: billingRun.id,
          billingPeriodItems: [],
          usageOverages,
        })
      expect(lineItems.length).toBe(0)
    })

    it('should not create line items if usageEventsPerUnit is 0', () => {
      // Test that when usageEventsPerUnit is 0 in usageOverages, no line items are created
      const usageOverages = [
        {
          usageMeterId: usageMeter.id,
          balance: 100,
          ledgerAccountId: ledgerAccount.id,
          priceId: usageBasedPrice.id,
          usageEventsPerUnit: 0,
          unitPrice: usageBasedPrice.unitPrice,
          livemode: true,
          name: null,
          description: null,
          usageEventId: 'test-usage-event-id',
        },
      ]
      const lineItems =
        billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts({
          invoiceId: 'some-invoice-id',
          billingRunId: billingRun.id,
          billingPeriodItems: [],
          usageOverages,
        })
      expect(lineItems.length).toBe(0)
    })

    it('should process usage overages regardless of matching billing period items', () => {
      // Usage overages are processed independently - they don't need to match billing period items
      const usageOverages = [
        {
          usageMeterId: 'some-other-meter-id',
          balance: 100,
          ledgerAccountId: 'some-other-account-id',
          priceId: usageBasedPrice.id,
          usageEventsPerUnit: 1,
          unitPrice: usageBasedPrice.unitPrice,
          livemode: true,
          name: null,
          description: null,
          usageEventId: 'test-usage-event-id',
        },
      ]
      const lineItems =
        billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts({
          invoiceId: 'some-invoice-id',
          billingRunId: billingRun.id,
          billingPeriodItems: [staticBillingPeriodItem],
          usageOverages,
        })

      expect(lineItems.length).toBe(2) // 1 static + 1 usage
      const staticItem = lineItems.find(
        (item) => item.type === SubscriptionItemType.Static
      )
      const usageItem = lineItems.find(
        (item) => item.type === SubscriptionItemType.Usage
      )
      expect(typeof staticItem).toBe('object')
      expect(typeof usageItem).toBe('object')
    })
  })

  describe('tabulateOutstandingUsageCosts', () => {
    let organization: Organization.Record
    let product: Product.Record
    let pricingModel: PricingModel.Record
    let price: Price.Record
    let usageBasedPrice: Price.Record
    let customer: Customer.Record
    let paymentMethod: PaymentMethod.Record
    let subscription: Subscription.Record
    let usageMeter: UsageMeter.Record

    beforeEach(async () => {
      const orgData = await setupOrg()
      organization = orgData.organization
      product = orgData.product
      price = orgData.price
      pricingModel = orgData.pricingModel

      customer = await setupCustomer({
        organizationId: organization.id,
      })
      paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })

      usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter For Tabulation',
        pricingModelId: pricingModel.id,
      })

      usageBasedPrice = await setupPrice({
        name: 'Metered Price For Tabulation',
        type: PriceType.Usage,
        unitPrice: 10,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
        usageMeterId: usageMeter.id,
      })

      subscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        paymentMethodId: paymentMethod.id,
        priceId: price.id,
        status: SubscriptionStatus.Active,
      })
    })

    afterEach(async () => {
      if (organization) {
        await teardownOrg({ organizationId: organization.id })
      }
    })

    it('should return empty results when no ledger accounts are provided', async () => {
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const ledgerAccountIds: string[] = []

          const result = await tabulateOutstandingUsageCosts(
            subscription.id,
            billingPeriod.endDate,
            transaction
          )

          expect(
            result.outstandingUsageCostsByLedgerAccountId.size
          ).toBe(0)
          expect(result.rawOutstandingUsageCosts.length).toBe(0)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should return empty results when ledger accounts exist but have no outstanding costs', async () => {
      const ledgerAccount = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await tabulateOutstandingUsageCosts(
            subscription.id,
            billingPeriod.endDate,
            transaction
          )

          expect(
            result.outstandingUsageCostsByLedgerAccountId.size
          ).toBe(0)
          expect(result.rawOutstandingUsageCosts.length).toBe(0)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should correctly tabulate a single outstanding usage cost for one ledger account', async () => {
      const ledgerAccount = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const ledgerTransaction = await setupLedgerTransaction({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            type: LedgerTransactionType.UsageEventProcessed,
          })
          const billingPeriod = await setupBillingPeriod({
            subscriptionId: subscription.id,
            startDate: new Date(Date.now() - 1000),
            endDate: new Date(Date.now() + 1000),
            status: BillingPeriodStatus.Active,
            livemode: true,
          })
          const usageEvent = await setupUsageEvent({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            amount: 5,
            priceId: usageBasedPrice.id,
            billingPeriodId: billingPeriod.id,
            transactionId: 'dummy_txn_1' + Math.random(),
            customerId: customer.id,
            usageDate: Date.now(),
          })

          const costEntry = await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerTransactionId: ledgerTransaction.id,
            ledgerAccountId: ledgerAccount.id,
            amount: 100,
            entryType: LedgerEntryType.UsageCost,
            sourceUsageEventId: usageEvent.id,
            status: LedgerEntryStatus.Posted,
            usageMeterId: usageMeter.id,
          })

          const result = await tabulateOutstandingUsageCosts(
            subscription.id,
            billingPeriod.endDate,
            transaction
          )
          expect(result.rawOutstandingUsageCosts.length).toBe(1)
          const rawCost = result.rawOutstandingUsageCosts[0]
          expect(rawCost.ledgerAccountId).toBe(ledgerAccount.id)
          expect(rawCost.usageMeterId).toBe(usageMeter.id)
          expect(rawCost.balance).toBe(100)

          expect(
            result.outstandingUsageCostsByLedgerAccountId.size
          ).toBe(1)
          const aggregatedCost =
            result.outstandingUsageCostsByLedgerAccountId.get(
              ledgerAccount.id
            )
          expect(aggregatedCost).toMatchObject({
            ledgerAccountId: ledgerAccount.id,
          })
          expect(aggregatedCost?.ledgerAccountId).toBe(
            ledgerAccount.id
          )
          expect(aggregatedCost?.usageMeterId).toBe(usageMeter.id)
          expect(aggregatedCost?.subscriptionId).toBe(subscription.id)
          expect(aggregatedCost?.outstandingBalance).toBe(100)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should handle multiple outstanding usage costs for one ledger account (map behavior)', async () => {
      const ledgerAccount = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const ledgerTransaction = await setupLedgerTransaction({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            type: LedgerTransactionType.UsageEventProcessed,
          })
          const billingPeriod = await setupBillingPeriod({
            subscriptionId: subscription.id,
            startDate: new Date(Date.now() - 1000),
            endDate: new Date(Date.now() + 1000),
            status: BillingPeriodStatus.Active,
            livemode: true,
          })
          const usageEvent1 = await setupUsageEvent({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            amount: 10,
            priceId: usageBasedPrice.id,
            billingPeriodId: billingPeriod.id,
            transactionId: 'dummy_txn_1' + Math.random(),
            customerId: customer.id,
            usageDate: Date.now() - 2000,
          })

          const usageEvent2 = await setupUsageEvent({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            amount: 5,
            priceId: usageBasedPrice.id,
            billingPeriodId: billingPeriod.id,
            transactionId: 'dummy_txn_2' + Math.random(),
            customerId: customer.id,
            usageDate: Date.now() - 1000,
          })

          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerTransactionId: ledgerTransaction.id,
            ledgerAccountId: ledgerAccount.id,
            amount: usageEvent1.amount,
            entryType: LedgerEntryType.UsageCost,
            sourceUsageEventId: usageEvent1.id,
            status: LedgerEntryStatus.Posted,
            usageMeterId: usageMeter.id,
            entryTimestamp: usageEvent1.usageDate,
          })

          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerTransactionId: ledgerTransaction.id,
            ledgerAccountId: ledgerAccount.id,
            amount: usageEvent2.amount,
            entryType: LedgerEntryType.UsageCost,
            sourceUsageEventId: usageEvent2.id,
            status: LedgerEntryStatus.Posted,
            usageMeterId: usageMeter.id,
            entryTimestamp: usageEvent2.usageDate,
          })

          const result = await tabulateOutstandingUsageCosts(
            subscription.id,
            billingPeriod.endDate,
            transaction
          )

          expect(result.rawOutstandingUsageCosts.length).toBe(1)
          expect(result.rawOutstandingUsageCosts[0].balance).toBe(
            usageEvent1.amount + usageEvent2.amount
          )

          expect(
            result.outstandingUsageCostsByLedgerAccountId.size
          ).toBe(1)
          const aggregatedCost =
            result.outstandingUsageCostsByLedgerAccountId.get(
              ledgerAccount.id
            )
          expect(aggregatedCost).toMatchObject({
            usageMeterId: usageMeter.id,
          })
          expect(aggregatedCost?.outstandingBalance).toBe(
            usageEvent1.amount + usageEvent2.amount
          )
          expect(aggregatedCost?.usageMeterId).toBe(usageMeter.id)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should correctly tabulate costs for multiple ledger accounts, some with and some without costs', async () => {
      const la1 = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
      })
      const anotherUsageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Another Meter',
        pricingModelId: pricingModel.id,
      })
      const la2 = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: anotherUsageMeter.id,
        livemode: true,
      })
      const usageMeter3 = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Another Meter 3',
        pricingModelId: pricingModel.id,
      })
      const la3 = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter3.id,
        livemode: true,
      })

      const lt = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        type: LedgerTransactionType.UsageEventProcessed,
      })
      const billingPeriod = await setupBillingPeriod({
        subscriptionId: subscription.id,
        startDate: new Date(Date.now() - 1000),
        endDate: new Date(Date.now() + 1000),
        status: BillingPeriodStatus.Active,
        livemode: true,
      })
      const ue1 = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        amount: 10,
        priceId: usageBasedPrice.id,
        billingPeriodId: billingPeriod.id,
        transactionId: 'strp_d3' + Math.random(),
        customerId: customer.id,
      })
      await setupDebitLedgerEntry({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: lt.id,
        ledgerAccountId: la1.id,
        amount: 100,
        entryType: LedgerEntryType.UsageCost,
        sourceUsageEventId: ue1.id,
        status: LedgerEntryStatus.Posted,
        usageMeterId: usageMeter.id,
      })

      const ue3 = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter3.id,
        amount: 20,
        priceId: usageBasedPrice.id,
        billingPeriodId: billingPeriod.id,
        transactionId: 'strp_d4' + Math.random(),
        customerId: customer.id,
      })
      await setupDebitLedgerEntry({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        ledgerTransactionId: lt.id,
        ledgerAccountId: la3.id,
        amount: 200,
        entryType: LedgerEntryType.UsageCost,
        sourceUsageEventId: ue3.id,
        status: LedgerEntryStatus.Posted,
        usageMeterId: usageMeter.id,
        entryTimestamp: billingPeriod.endDate - 1000,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const result = await tabulateOutstandingUsageCosts(
            subscription.id,
            billingPeriod.endDate,
            transaction
          )

          expect(result.rawOutstandingUsageCosts.length).toBe(2)
          expect(
            result.outstandingUsageCostsByLedgerAccountId.size
          ).toBe(2)

          const costLa1Raw = result.rawOutstandingUsageCosts.find(
            (c) => c.ledgerAccountId === la1.id
          )
          const costLa3Raw = result.rawOutstandingUsageCosts.find(
            (c) => c.ledgerAccountId === la3.id
          )
          expect(costLa1Raw?.balance).toBe(100)
          expect(costLa3Raw?.balance).toBe(200)

          const aggCostLa1 =
            result.outstandingUsageCostsByLedgerAccountId.get(la1.id)
          expect(aggCostLa1).toEqual<OutstandingUsageCostAggregation>(
            {
              ledgerAccountId: la1.id,
              usageMeterId: usageMeter.id,
              subscriptionId: subscription.id,
              outstandingBalance: 100,
              priceId: usageBasedPrice.id,
              usageEventsPerUnit: 1,
              unitPrice: 10,
              livemode: true,
              name: expect.stringContaining('Usage: '),
              description: expect.stringContaining('usageEventId'),
            }
          )

          const aggCostLa3 =
            result.outstandingUsageCostsByLedgerAccountId.get(la3.id)
          expect(aggCostLa3).toEqual<OutstandingUsageCostAggregation>(
            {
              ledgerAccountId: la3.id,
              usageMeterId: usageMeter.id,
              subscriptionId: subscription.id,
              outstandingBalance: 200,
              priceId: usageBasedPrice.id,
              usageEventsPerUnit: 1,
              unitPrice: 10,
              livemode: true,
              name: expect.stringContaining('Usage: '),
              description: expect.stringContaining('usageEventId'),
            }
          )

          expect(
            result.outstandingUsageCostsByLedgerAccountId.has(la2.id)
          ).toBe(false)
          return Result.ok(undefined)
        })
      ).unwrap()
    })

    it('should only include usage costs up to the billingPeriodEndDate', async () => {
      const ledgerAccount = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
      })

      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          const billingPeriodEndDate = new Date()
          const billingPeriod = await setupBillingPeriod({
            subscriptionId: subscription.id,
            startDate: new Date(
              billingPeriodEndDate.getTime() -
                30 * 24 * 60 * 60 * 1000
            ),
            endDate: billingPeriodEndDate,
            status: BillingPeriodStatus.Active,
            livemode: true,
          })
          const ledgerTransaction = await setupLedgerTransaction({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            type: LedgerTransactionType.UsageEventProcessed,
          })

          // Cost included: timestamp is on the end date
          const usageEvent1 = await setupUsageEvent({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            amount: 10,
            priceId: usageBasedPrice.id,
            billingPeriodId: billingPeriod.id,
            transactionId: 'dummy_txn_included_' + Math.random(),
            customerId: customer.id,
            usageDate: billingPeriodEndDate.getTime() - 1000, // within period
          })
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerTransactionId: ledgerTransaction.id,
            ledgerAccountId: ledgerAccount.id,
            amount: 150,
            entryType: LedgerEntryType.UsageCost,
            sourceUsageEventId: usageEvent1.id,
            status: LedgerEntryStatus.Posted,
            usageMeterId: usageMeter.id,
            entryTimestamp: billingPeriodEndDate.getTime() - 1000, // on the boundary
          })

          // Cost excluded: timestamp is after the end date
          const usageEvent2 = await setupUsageEvent({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            usageMeterId: usageMeter.id,
            amount: 5,
            priceId: usageBasedPrice.id,
            billingPeriodId: billingPeriod.id,
            transactionId: 'dummy_txn_excluded_' + Math.random(),
            customerId: customer.id,
            usageDate: billingPeriodEndDate.getTime() + 1000, // outside period
          })
          await setupDebitLedgerEntry({
            organizationId: organization.id,
            subscriptionId: subscription.id,
            ledgerTransactionId: ledgerTransaction.id,
            ledgerAccountId: ledgerAccount.id,
            amount: 250,
            entryType: LedgerEntryType.UsageCost,
            sourceUsageEventId: usageEvent2.id,
            status: LedgerEntryStatus.Posted,
            usageMeterId: usageMeter.id,
            entryTimestamp: billingPeriodEndDate.getTime() + 1, // after the boundary
          })

          const result = await tabulateOutstandingUsageCosts(
            subscription.id,
            billingPeriod.endDate,
            transaction
          )

          expect(result.rawOutstandingUsageCosts.length).toBe(1)
          expect(result.rawOutstandingUsageCosts[0].balance).toBe(150)

          expect(
            result.outstandingUsageCostsByLedgerAccountId.size
          ).toBe(1)
          const aggregatedCost =
            result.outstandingUsageCostsByLedgerAccountId.get(
              ledgerAccount.id
            )
          expect(aggregatedCost).toMatchObject({
            outstandingBalance: 150,
          })
          expect(aggregatedCost?.outstandingBalance).toBe(150)
          return Result.ok(undefined)
        })
      ).unwrap()
    })
  })

  describe('billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts', () => {
    let invoice: Invoice.Record
    beforeEach(async () => {
      invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
        status: InvoiceStatus.Draft,
      })
    })
    it('should correctly generate a Static invoice line item', () => {
      const lineItems =
        billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts({
          invoiceId: invoice.id,
          billingRunId: billingRun.id,
          billingPeriodItems: [staticBillingPeriodItem],
          usageOverages: [],
        })

      expect(lineItems.length).toBe(1)
      const staticLineItem =
        lineItems[0] as InvoiceLineItem.StaticInsert
      expect(staticLineItem.type).toBe(SubscriptionItemType.Static)
      expect(staticLineItem.quantity).toBe(
        staticBillingPeriodItem.quantity
      )
      expect(staticLineItem.ledgerAccountId).toBeNull()
      expect(staticLineItem.ledgerAccountCredit).toBeNull()
    })

    it('should correctly generate a Usage line item with ledger mapping', () => {
      const usageOverages = [
        {
          usageMeterId: usageMeter.id,
          balance: 100,
          ledgerAccountId: ledgerAccount.id,
          priceId: usageBasedPrice.id,
          usageEventsPerUnit: 1,
          unitPrice: usageBasedPrice.unitPrice,
          livemode: true,
          name: null,
          description: null,
          usageEventId: 'test-usage-event-id',
        },
      ]

      const lineItems =
        billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts({
          invoiceId: invoice.id,
          billingRunId: billingRun.id,
          billingPeriodItems: [],
          usageOverages,
        })

      expect(lineItems.length).toBe(1)
      const usageLineItem =
        lineItems[0] as InvoiceLineItem.UsageInsert
      expect(usageLineItem.type).toBe(SubscriptionItemType.Usage)
      expect(usageLineItem.quantity).toBe(100)
      expect(usageLineItem.ledgerAccountId).toBe(ledgerAccount.id)
      expect(usageLineItem.ledgerAccountCredit).toBe(100)
    })

    it('should filter out Usage items with a zero balance', () => {
      const usageOverages = [
        {
          usageMeterId: usageMeter.id,
          balance: 0,
          ledgerAccountId: ledgerAccount.id,
          priceId: usageBasedPrice.id,
          usageEventsPerUnit: 1,
          unitPrice: usageBasedPrice.unitPrice,
          livemode: true,
          name: null,
          description: null,
          usageEventId: 'test-usage-event-id',
        },
      ]

      const lineItems =
        billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts({
          invoiceId: invoice.id,
          billingRunId: billingRun.id,
          billingPeriodItems: [],
          usageOverages,
        })

      expect(lineItems.length).toBe(0)
    })

    it('should generate both Static and Usage line items together', () => {
      const usageOverages = [
        {
          usageMeterId: usageMeter.id,
          balance: 500,
          ledgerAccountId: ledgerAccount.id,
          priceId: usageBasedPrice.id,
          usageEventsPerUnit: 1,
          unitPrice: usageBasedPrice.unitPrice,
          livemode: true,
          name: null,
          description: null,
          usageEventId: 'test-usage-event-id',
        },
      ]
      const lineItems =
        billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts({
          invoiceId: invoice.id,
          billingRunId: billingRun.id,
          billingPeriodItems: [staticBillingPeriodItem], // Only static items - usage comes from usageOverages
          usageOverages,
        })

      expect(lineItems.length).toBe(2)
      const staticItem = lineItems.find(
        (item) => item.type === SubscriptionItemType.Static
      )
      const usageItem = lineItems.find(
        (item) => item.type === SubscriptionItemType.Usage
      )
      expect(typeof staticItem).toBe('object')
      expect(typeof usageItem).toBe('object')
    })

    it('should return quantity 0 if usageEventsPerUnit is null', () => {
      const usageOverages = [
        {
          usageMeterId: usageMeter.id,
          balance: 100,
          ledgerAccountId: ledgerAccount.id,
          priceId: usageBasedPrice.id,
          usageEventsPerUnit: null as any, // null to test the edge case
          unitPrice: usageBasedPrice.unitPrice,
          livemode: true,
          name: null,
          description: null,
          usageEventId: 'test-usage-event-id',
        },
      ]
      const lineItems =
        billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts({
          invoiceId: invoice.id,
          billingRunId: billingRun.id,
          billingPeriodItems: [],
          usageOverages,
        })
      expect(lineItems.length).toBe(0)
    })

    it('should not create line items if usageEventsPerUnit is 0', () => {
      const usageOverages = [
        {
          usageMeterId: usageMeter.id,
          balance: 100,
          ledgerAccountId: ledgerAccount.id,
          priceId: usageBasedPrice.id,
          usageEventsPerUnit: 0, // 0 to test filtering
          unitPrice: usageBasedPrice.unitPrice,
          livemode: true,
          name: null,
          description: null,
          usageEventId: 'test-usage-event-id',
        },
      ]
      const lineItems =
        billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts({
          invoiceId: invoice.id,
          billingRunId: billingRun.id,
          billingPeriodItems: [], // No static items, testing usage only
          usageOverages,
        })
      expect(lineItems.length).toBe(0)
    })

    it('should process usage overages regardless of matching billing period items', () => {
      // Usage overages are processed independently - they don't need to match billing period items
      const usageOverages = [
        {
          usageMeterId: 'some-other-meter-id',
          balance: 100,
          ledgerAccountId: 'some-other-account-id',
          priceId: usageBasedPrice.id,
          usageEventsPerUnit: 1,
          unitPrice: usageBasedPrice.unitPrice,
          livemode: true,
          name: null,
          description: null,
          usageEventId: 'test-usage-event-id',
        },
      ]
      const lineItems =
        billingPeriodItemsAndUsageOveragesToInvoiceLineItemInserts({
          invoiceId: invoice.id,
          billingRunId: billingRun.id,
          billingPeriodItems: [staticBillingPeriodItem],
          usageOverages,
        })

      expect(lineItems.length).toBe(2) // 1 static + 1 usage
      const staticItem = lineItems.find(
        (item) => item.type === SubscriptionItemType.Static
      )
      const usageItem = lineItems.find(
        (item) => item.type === SubscriptionItemType.Usage
      )
      expect(typeof staticItem).toBe('object')
      expect(typeof usageItem).toBe('object')
    })
  })

  describe('safelyInsertBillingRun Protection', () => {
    it('returns ValidationError when attempting ALL billing run creation methods for canceled subscriptions', async () => {
      // Cancel the subscription
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await safelyUpdateSubscriptionStatus(
            subscription,
            SubscriptionStatus.Canceled,
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      // Test 1: Direct safelyInsertBillingRun call should return ValidationError
      const result1 = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            safelyInsertBillingRun(
              {
                billingPeriodId: billingPeriod.id,
                scheduledFor: Date.now(),
                status: BillingRunStatus.Scheduled,
                subscriptionId: subscription.id,
                paymentMethodId: paymentMethod.id,
                livemode: billingPeriod.livemode,
              },
              transaction
            )
          )
        })
      ).unwrap()
      expect(result1.status).toBe('error')
      if (result1.status === 'error') {
        expect(result1.error).toBeInstanceOf(ValidationError)
        expect(result1.error.message).toBe(
          'Invalid subscription: Cannot create billing run for canceled subscription'
        )
      }

      // Test 2: createBillingRun should return ValidationError
      const result2 = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            createBillingRun(
              {
                billingPeriod,
                paymentMethod,
                scheduledFor: Date.now(),
              },
              transaction
            )
          )
        })
      ).unwrap()
      expect(result2.status).toBe('error')
      if (result2.status === 'error') {
        expect(result2.error).toBeInstanceOf(ValidationError)
        expect(result2.error.message).toBe(
          'Invalid subscription: Cannot create billing run for canceled subscription'
        )
      }

      // Test 3: scheduleBillingRunRetry should return ValidationError
      const result3 = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            scheduleBillingRunRetry(billingRun, transaction)
          )
        })
      ).unwrap()
      if (!result3) {
        throw new Error('Expected result3 to be defined')
      }
      expect(result3.status).toBe('error')
      if (result3.status === 'error') {
        expect(result3.error).toBeInstanceOf(ValidationError)
        expect(result3.error.message).toBe(
          'Invalid subscription: Cannot create billing run for canceled subscription'
        )
      }
    })

    it('should allow billing run creation for active subscriptions', async () => {
      // Ensure subscription is active
      ;(
        await adminTransactionWithResult(async ({ transaction }) => {
          await safelyUpdateSubscriptionStatus(
            subscription,
            SubscriptionStatus.Active,
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()

      // All billing run creation methods should work
      const directInsert = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            safelyInsertBillingRun(
              {
                billingPeriodId: billingPeriod.id,
                scheduledFor: Date.now(),
                status: BillingRunStatus.Scheduled,
                subscriptionId: subscription.id,
                paymentMethodId: paymentMethod.id,
                livemode: billingPeriod.livemode,
              },
              transaction
            )
          )
        })
      ).unwrap()
      expect(typeof directInsert).toBe('object')

      const createBillingRunResult = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            createBillingRun(
              {
                billingPeriod,
                paymentMethod,
                scheduledFor: Date.now(),
              },
              transaction
            )
          )
        })
      ).unwrap()
      expect(typeof createBillingRunResult).toBe('object')

      const retryResult = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            scheduleBillingRunRetry(billingRun, transaction)
          )
        })
      ).unwrap()
      expect(typeof retryResult).toBe('object')
    })
  })

  describe('safelyInsertBillingRun doNotCharge Protection', () => {
    let organization: Organization.Record
    let pricingModel: PricingModel.Record
    let product: Product.Record
    let staticPrice: Price.Record
    let customer: Customer.Record
    let paymentMethod: PaymentMethod.Record
    let doNotChargeSubscription: Subscription.Record
    let doNotChargeBillingPeriod: BillingPeriod.Record

    beforeEach(async () => {
      const orgData = await setupOrg()
      organization = orgData.organization
      pricingModel = orgData.pricingModel
      product = orgData.product
      staticPrice = orgData.price

      customer = await setupCustomer({
        organizationId: organization.id,
      })
      paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })

      doNotChargeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: staticPrice.id,
        status: SubscriptionStatus.Active,
        doNotCharge: true,
      })

      doNotChargeBillingPeriod = await setupBillingPeriod({
        subscriptionId: doNotChargeSubscription.id,
        startDate: Date.now(),
        endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
      })
    })

    afterEach(async () => {
      if (organization) {
        await teardownOrg({ organizationId: organization.id })
      }
    })

    it('returns ValidationError for doNotCharge subscriptions via safelyInsertBillingRun', async () => {
      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            safelyInsertBillingRun(
              {
                billingPeriodId: doNotChargeBillingPeriod.id,
                scheduledFor: Date.now(),
                status: BillingRunStatus.Scheduled,
                subscriptionId: doNotChargeSubscription.id,
                paymentMethodId: paymentMethod.id,
                livemode: doNotChargeBillingPeriod.livemode,
              },
              transaction
            )
          )
        })
      ).unwrap()
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error).toBeInstanceOf(ValidationError)
        expect(result.error.message).toBe(
          'Invalid subscription: Cannot create billing run for doNotCharge subscription'
        )
      }
    })

    it('returns ValidationError for doNotCharge subscriptions via createBillingRun', async () => {
      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            createBillingRun(
              {
                billingPeriod: doNotChargeBillingPeriod,
                paymentMethod,
                scheduledFor: Date.now(),
              },
              transaction
            )
          )
        })
      ).unwrap()
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error).toBeInstanceOf(ValidationError)
        expect(result.error.message).toBe(
          'Invalid subscription: Cannot create billing run for doNotCharge subscription'
        )
      }
    })

    it('returns ValidationError for doNotCharge subscriptions via scheduleBillingRunRetry', async () => {
      // Create a mock billing run to retry (normally this wouldn't exist due to prevention,
      // but we test the retry path defensively). We use a type assertion because setupBillingRun
      // would return a ValidationError for doNotCharge subscriptions (it calls safelyInsertBillingRun which returns a ValidationError).
      const mockBillingRunForRetry = {
        id: 'mock_billing_run_id',
        billingPeriodId: doNotChargeBillingPeriod.id,
        subscriptionId: doNotChargeSubscription.id,
        paymentMethodId: paymentMethod.id,
        scheduledFor: Date.now(),
        status: BillingRunStatus.Failed,
        livemode: doNotChargeBillingPeriod.livemode,
        attemptNumber: 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByCommit: null,
        updatedByCommit: null,
        position: 0,
        startedAt: null,
        completedAt: null,
        stripePaymentIntentId: null,
        lastPaymentIntentEventTimestamp: null,
        isAdjustment: false,
      } as BillingRun.Record

      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            scheduleBillingRunRetry(
              mockBillingRunForRetry,
              transaction
            )
          )
        })
      ).unwrap()
      if (!result) {
        throw new Error('Expected result to be defined')
      }
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.error).toBeInstanceOf(ValidationError)
        expect(result.error.message).toBe(
          'Invalid subscription: Cannot create billing run for doNotCharge subscription'
        )
      }
    })
  })

  describe('doNotCharge subscriptions', () => {
    let organization: Organization.Record
    let pricingModel: PricingModel.Record
    let product: Product.Record
    let staticPrice: Price.Record
    let customer: Customer.Record
    let paymentMethod: PaymentMethod.Record
    let doNotChargeSubscription: Subscription.Record
    let billingPeriod: BillingPeriod.Record
    let billingRun: BillingRun.Record
    let usageMeter: UsageMeter.Record
    let usageBasedPrice: Price.Record
    let ledgerAccount: LedgerAccount.Record
    let subscriptionItem: SubscriptionItem.Record

    beforeEach(async () => {
      const orgData = await setupOrg()
      organization = orgData.organization
      pricingModel = orgData.pricingModel
      product = orgData.product
      staticPrice = orgData.price

      customer = await setupCustomer({
        organizationId: organization.id,
      })
      paymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
      })

      usageMeter = await setupUsageMeter({
        organizationId: organization.id,
        name: 'Test Usage Meter For DoNotCharge',
        pricingModelId: pricingModel.id,
        livemode: true,
      })

      usageBasedPrice = await setupPrice({
        name: 'Usage Based Price For DoNotCharge',
        type: PriceType.Usage,
        unitPrice: 15,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: organization.defaultCurrency,
        usageMeterId: usageMeter.id,
      })

      doNotChargeSubscription = await setupSubscription({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: staticPrice.id,
        status: SubscriptionStatus.Active,
        doNotCharge: true,
      })

      subscriptionItem = await setupSubscriptionItem({
        subscriptionId: doNotChargeSubscription.id,
        name: 'Static Subscription Item',
        quantity: 1,
        unitPrice: 0, // doNotCharge subscriptions have subscription items with 0 unitPrice
        priceId: staticPrice.id,
      })

      billingPeriod = await setupBillingPeriod({
        subscriptionId: doNotChargeSubscription.id,
        startDate: doNotChargeSubscription.currentBillingPeriodStart!,
        endDate: doNotChargeSubscription.currentBillingPeriodEnd!,
        status: BillingPeriodStatus.Active,
      })

      // Set up billing period item for the static subscription
      await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 0, // doNotCharge subscriptions have billing period items with 0 unitPrice (inherited from subscription items)
        name: 'Static Subscription Item',
      })

      /**
       * Defensive edge case test: In normal operation, doNotCharge subscriptions should never
       * have billing runs created (see createSubscription/helpers.ts:maybeCreateInitialBillingPeriodAndRun
       * and safelyInsertBillingRun which throws an error for doNotCharge subscriptions).
       *
       * However, this test verifies that if a billing run somehow exists for a doNotCharge subscription
       * 1. Excluding usage overages from billing calculations
       * 2. Calculating totalDueAmount as 0 (since subscription items have unitPrice: 0)
       * 3. Skipping payment intent creation when amountToCharge <= 0
       *
       * NOTE: We use a direct database insert here because setupBillingRun would throw for doNotCharge
       * subscriptions (it calls safelyInsertBillingRun which throws an error). This simulates the edge case
       * where a billing run exists despite the prevention mechanism.
       */
      const billingRunInsert = billingRunsInsertSchema.parse({
        billingPeriodId: billingPeriod.id,
        scheduledFor: Date.now(),
        status: BillingRunStatus.Scheduled,
        subscriptionId: doNotChargeSubscription.id,
        paymentMethodId: paymentMethod.id,
        livemode: billingPeriod.livemode,
        attemptNumber: 1,
        isAdjustment: false,
        pricingModelId: pricingModel.id,
      }) as BillingRun.Insert & { pricingModelId: string }
      billingRun = (
        await adminTransactionWithResult(async ({ transaction }) => {
          const [inserted] = await transaction
            .insert(billingRuns)
            .values(billingRunInsert)
            .returning()
          return Result.ok(billingRunsSelectSchema.parse(inserted))
        })
      ).unwrap()

      ledgerAccount = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: doNotChargeSubscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
      })
    })

    afterEach(async () => {
      if (organization) {
        await teardownOrg({ organizationId: organization.id })
      }
    })

    it('should not include usage overages in billing calculations for doNotCharge subscriptions', async () => {
      // Create usage events that would normally create overages
      const ledgerTransaction = await setupLedgerTransaction({
        organizationId: organization.id,
        subscriptionId: doNotChargeSubscription.id,
        type: LedgerTransactionType.UsageEventProcessed,
      })

      const usageEvent = await setupUsageEvent({
        organizationId: organization.id,
        subscriptionId: doNotChargeSubscription.id,
        usageMeterId: usageMeter.id,
        amount: 1000,
        priceId: usageBasedPrice.id,
        billingPeriodId: billingPeriod.id,
        transactionId: 'dnc_test_txn_' + Math.random(),
        customerId: customer.id,
      })

      await setupDebitLedgerEntry({
        organizationId: organization.id,
        subscriptionId: doNotChargeSubscription.id,
        ledgerAccountId: ledgerAccount.id,
        ledgerTransactionId: ledgerTransaction.id,
        amount: 1000,
        entryType: LedgerEntryType.UsageCost,
        sourceUsageEventId: usageEvent.id,
        status: LedgerEntryStatus.Posted,
        usageMeterId: usageMeter.id,
      })

      const result = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await executeBillingRunCalculationAndBookkeepingSteps(
              billingRun,
              transaction
            )
          )
        })
      ).unwrap()

      // Verify subscription has doNotCharge flag
      expect(result?.subscription?.doNotCharge).toBe(true)

      // Verify invoice line items don't include usage items
      const invoiceLineItems = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await selectInvoiceLineItems(
              { invoiceId: result.invoice.id },
              transaction
            )
          )
        })
      ).unwrap()
      const usageLineItems = invoiceLineItems.filter(
        (item) => item.type === SubscriptionItemType.Usage
      )
      expect(usageLineItems.length).toBe(0)

      // Usage events should be recorded in ledger
      const entries = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            await selectLedgerEntries(
              { ledgerAccountId: ledgerAccount.id },
              transaction
            )
          )
        })
      ).unwrap()
      expect(entries.length).toBe(1)
      expect(entries[0].amount).toBe(1000)

      // Verify usage costs exist but were excluded from billing
      const { rawOutstandingUsageCosts } = (
        await adminTransactionWithResult(async ({ transaction }) => {
          return Result.ok(
            tabulateOutstandingUsageCosts(
              doNotChargeSubscription.id,
              billingPeriod.endDate,
              transaction
            )
          )
        })
      ).unwrap()

      expect(rawOutstandingUsageCosts.length).toBe(1)
      // Check the individual cost entry (we set up 1000 in the test)
      expect(rawOutstandingUsageCosts[0]!.balance).toBe(1000)

      // Finally, verify totalDueAmount excludes usage costs
      // Since billing period item has unitPrice: 0 and usage costs are excluded, totalDueAmount should be 0
      expect(result.totalDueAmount).toBe(0)
    })
  })
})
