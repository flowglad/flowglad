import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { adminTransaction } from '@/db/adminTransaction'
import {
  setupOrg,
  setupCustomer,
  setupPaymentMethod,
  setupBillingPeriod,
  setupBillingRun,
  setupBillingPeriodItem,
  setupInvoice,
  setupSubscription,
  setupLedgerAccount,
  setupLedgerTransaction,
  setupDebitLedgerEntry,
  setupUsageEvent,
  setupUsageMeter,
  setupPrice,
  teardownOrg,
  setupSubscriptionItem,
  setupSubscriptionItemFeature,
  setupProductFeature,
  setupUsageCreditGrantFeature,
} from '@/../seedDatabase'
import {
  calculateFeeAndTotalAmountDueForBillingPeriod,
  processOutstandingBalanceForBillingPeriod,
  processNoMoreDueForBillingPeriod,
  executeBillingRunCalculationAndBookkeepingSteps,
  executeBillingRun,
  scheduleBillingRunRetry,
  constructBillingRunRetryInsert,
  createInvoiceInsertForBillingRun,
  billingPeriodItemsToInvoiceLineItemInserts,
  calculateTotalAmountToCharge,
  tabulateOutstandingUsageCosts,
  createBillingRun,
} from './billingRunHelpers'
import {
  BillingPeriodStatus,
  BillingRunStatus,
  CurrencyCode,
  InvoiceStatus,
  InvoiceType,
  PaymentMethodType,
  SubscriptionItemType,
  PriceType,
  IntervalUnit,
  SubscriptionStatus,
  LedgerEntryStatus,
  LedgerEntryType,
  LedgerTransactionType,
  FeatureType,
  FeatureUsageGrantFrequency,
  PaymentStatus,
  CountryCode,
} from '@/types'
import { BillingRun } from '@/db/schema/billingRuns'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { Customer } from '@/db/schema/customers'
import {
  selectBillingRunById,
  updateBillingRun,
  safelyInsertBillingRun,
} from '@/db/tableMethods/billingRunMethods'
import { Subscription } from '@/db/schema/subscriptions'
import { updateBillingPeriod } from '@/db/tableMethods/billingPeriodMethods'
import { Payment } from '@/db/schema/payments'
import { Invoice } from '@/db/schema/invoices'
import { updateCustomer } from '@/db/tableMethods/customerMethods'
import {
  safelyUpdatePaymentMethod,
  updatePaymentMethod,
} from '@/db/tableMethods/paymentMethodMethods'
import {
  deleteInvoiceLineItemsByinvoiceId,
  insertInvoiceLineItems,
} from '@/db/tableMethods/invoiceLineItemMethods'
import {
  invoiceIsInTerminalState,
  insertInvoice,
  selectInvoices,
  updateInvoice,
  safelyUpdateInvoiceStatus,
} from '@/db/tableMethods/invoiceMethods'
import { insertPayment } from '@/db/tableMethods/paymentMethods'
import core from '@/utils/core'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { safelyUpdateSubscriptionStatus } from '@/db/tableMethods/subscriptionMethods'
import { OutstandingUsageCostAggregation } from '@/db/ledgerManager/ledgerManagerTypes'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { UsageMeter } from '@/db/schema/usageMeters'
import { PricingModel } from '@/db/schema/pricingModels'
import { LedgerAccount } from '@/db/schema/ledgerAccounts'
import { updateBillingPeriodItem } from '@/db/tableMethods/billingPeriodItemMethods'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import { selectLedgerEntries } from '@/db/tableMethods/ledgerEntryMethods'
import { SubscriptionItem } from '@/db/schema/subscriptionItems'

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
      productId: product.id,
      name: 'Global Usage Based Price',
      type: PriceType.Usage,
      unitPrice: 15,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      setupFeeAmount: 0,
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

    usageBillingPeriodItem = await setupBillingPeriodItem({
      billingPeriodId: billingPeriod.id,
      quantity: 1, // Usage items typically start at 0 quantity in BPI
      unitPrice: usageBasedPrice.unitPrice,
      name: usageBasedPrice.name ?? 'Global Usage Based Item Name',
      type: SubscriptionItemType.Usage,
      usageMeterId: usageMeter.id,
      usageEventsPerUnit: 1,
      description: 'Test Description',
    })

    billingPeriodItems = [
      staticBillingPeriodItem,
      usageBillingPeriodItem,
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
      const updatedBillingPeriod = await adminTransaction(
        ({ transaction }) =>
          processOutstandingBalanceForBillingPeriod(
            billingPeriod,
            transaction
          )
      )
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
      const result = await adminTransaction(
        async ({ transaction }) => {
          const updatedBillingPeriod = await updateBillingPeriod(
            {
              id: billingPeriod.id,
              endDate: Date.now() - 180 * 1000,
            },
            transaction
          )
          return processNoMoreDueForBillingPeriod(
            {
              billingRun,
              billingPeriod: updatedBillingPeriod,
              invoice,
            },
            transaction
          )
        }
      )
      expect(result.billingPeriod.status).toBe(
        BillingPeriodStatus.Completed
      )
    })
  })

  describe('Payment Intent Creation and Confirmation', () => {
    it('should create a payment intent for the correct amount', async () => {
      const { totalDueAmount } = await adminTransaction(
        ({ transaction }) =>
          calculateFeeAndTotalAmountDueForBillingPeriod(
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
      expect(totalDueAmount).toBeGreaterThan(0)
    })

    it('should not create a payment intent if the invoice is in a terminal state', async () => {
      await setupInvoice({
        billingPeriodId: billingPeriod.id,
        status: InvoiceStatus.Paid,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })
      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )
      expect(result.invoice.status).toBe(InvoiceStatus.Paid)
    })
    it('should calculate the correct amount to charge based on total due and amount paid', async () => {
      const totalDueAmount = 1000
      const totalAmountPaid = 400
      const payments: Payment.Record[] = []

      const amountToCharge = calculateTotalAmountToCharge({
        totalDueAmount,
        totalAmountPaid,
        payments,
      })

      expect(amountToCharge).toBe(600)
    })

    it('should return 0 when amount paid equals or exceeds total due', async () => {
      const totalDueAmount = 1000
      const totalAmountPaid = 1000
      const payments: Payment.Record[] = []

      const amountToCharge = calculateTotalAmountToCharge({
        totalDueAmount,
        totalAmountPaid,
        payments,
      })

      expect(amountToCharge).toBe(0)

      const overpaidAmount = calculateTotalAmountToCharge({
        totalDueAmount: 1000,
        totalAmountPaid: 1200,
        payments: [],
      })

      expect(overpaidAmount).toBe(0)
    })
  })

  describe('Fee Calculation and Total Due Amount', () => {
    it('should calculate the correct fee and total due amount', async () => {
      const { feeCalculation, totalDueAmount } =
        await adminTransaction(({ transaction }) =>
          calculateFeeAndTotalAmountDueForBillingPeriod(
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
      expect(feeCalculation).toBeDefined()
      expect(totalDueAmount).toBeGreaterThan(0)
    })

    it('should handle different currencies correctly', async () => {
      // Create an organization with a different default currency
      const originalOrg = await setupOrg()
      const orgWithDifferentCurrency = await adminTransaction(
        async ({ transaction }) => {
          return await updateOrganization(
            {
              id: originalOrg.organization.id,
              defaultCurrency: CurrencyCode.EUR,
            },
            transaction
          )
        }
      )

      const result = await adminTransaction(({ transaction }) =>
        calculateFeeAndTotalAmountDueForBillingPeriod(
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

      expect(result.feeCalculation).toBeDefined()
      expect(result.feeCalculation.currency).toBe(CurrencyCode.EUR)
    })

    it('should handle different billing period items correctly', async () => {
      // Create billing period items with different prices and quantities
      const testBillingPeriodItem = await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 2,
        unitPrice: 150,
      })

      const result = await adminTransaction(({ transaction }) =>
        calculateFeeAndTotalAmountDueForBillingPeriod(
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

      const result = await adminTransaction(({ transaction }) =>
        calculateFeeAndTotalAmountDueForBillingPeriod(
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

      expect(result.feeCalculation).toBeDefined()
      expect(result.feeCalculation.livemode).toBe(true)
    })

    it('should handle different payment methods correctly', async () => {
      // Create a different payment method
      const testPaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        type: PaymentMethodType.Card,
      })

      const result = await adminTransaction(({ transaction }) =>
        calculateFeeAndTotalAmountDueForBillingPeriod(
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

      expect(result.feeCalculation).toBeDefined()
      expect(result.feeCalculation.paymentMethodType).toBe(
        testPaymentMethod.type
      )
    })
  })

  describe('Invoice Creation and Line Items', () => {
    it('should create an invoice with the correct invoice number', async () => {
      const invoiceInsert = await adminTransaction(
        ({ transaction }) =>
          createInvoiceInsertForBillingRun(
            {
              billingPeriod,
              organization,
              customer,
              currency: staticPrice.currency,
            },
            transaction
          )
      )
      expect(invoiceInsert.invoiceNumber).toBeDefined()
    })

    it('should generate invoice line items from billing period items, ommiting items with 0 quantity', async () => {
      const invoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })
      const lineItems = billingPeriodItemsToInvoiceLineItemInserts({
        invoiceId: invoice.id,
        billingPeriodItems,
        usageOverages: [],
        billingRunId: billingRun.id,
      })
      expect(lineItems.length).toBe(1)
    })
  })

  describe('createInvoiceInsertForBillingRun', () => {
    it('should create an invoice with the correct properties', async () => {
      const invoiceInsert = await adminTransaction(
        ({ transaction }) =>
          createInvoiceInsertForBillingRun(
            {
              billingPeriod,
              organization,
              customer,
              currency: staticPrice.currency,
            },
            transaction
          )
      )

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
      expect(invoiceInsert.invoiceDate).toBeDefined()
      expect(invoiceInsert.dueDate).toBeDefined()
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

      const invoiceInsert = await adminTransaction(
        ({ transaction }) =>
          createInvoiceInsertForBillingRun(
            {
              billingPeriod,
              organization,
              customer: testCustomer,
              currency: staticPrice.currency,
            },
            transaction
          )
      )

      // The invoice number should be based on the customer's invoice number base and the count of existing invoices
      expect(invoiceInsert.invoiceNumber).toContain(invoiceNumberBase)
      expect(invoiceInsert.invoiceNumber).toContain('2') // Should be the 3rd invoice (index 2)
    })

    it('should handle different currencies', async () => {
      const testCurrency = CurrencyCode.EUR

      const invoiceInsert = await adminTransaction(
        ({ transaction }) =>
          createInvoiceInsertForBillingRun(
            {
              billingPeriod,
              organization,
              customer,
              currency: testCurrency,
            },
            transaction
          )
      )

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

      const invoiceInsert = await adminTransaction(
        ({ transaction }) =>
          createInvoiceInsertForBillingRun(
            {
              billingPeriod: testBillingPeriod,
              organization,
              customer,
              currency: staticPrice.currency,
            },
            transaction
          )
      )

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

      const invoiceInsert = await adminTransaction(
        ({ transaction }) =>
          createInvoiceInsertForBillingRun(
            {
              billingPeriod: testBillingPeriod,
              organization,
              customer,
              currency: staticPrice.currency,
            },
            transaction
          )
      )

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
      const result = await adminTransaction(({ transaction }) =>
        calculateFeeAndTotalAmountDueForBillingPeriod(
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

      expect(result.feeCalculation).toBeDefined()
      expect(result.totalDueAmount).toBeGreaterThan(0)
      const usageBillingPeriodItems = billingPeriodItems.filter(
        (item) => item.usageMeterId !== null
      )
      expect(result.totalDueAmount).toBe(
        billingPeriodItems.reduce(
          (acc, item) => acc + item.unitPrice * item.quantity,
          0
        ) -
          usageBillingPeriodItems.reduce(
            (acc, item) => acc + item.unitPrice * item.quantity,
            0
          )
      )
    })

    it('should handle different currencies correctly', async () => {
      // Create an organization with a different default currency
      const originalOrg = await setupOrg()
      const orgWithDifferentCurrency = await adminTransaction(
        async ({ transaction }) => {
          return await updateOrganization(
            {
              id: originalOrg.organization.id,
              defaultCurrency: CurrencyCode.EUR,
            },
            transaction
          )
        }
      )

      const result = await adminTransaction(({ transaction }) =>
        calculateFeeAndTotalAmountDueForBillingPeriod(
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

      expect(result.feeCalculation).toBeDefined()
      expect(result.feeCalculation.currency).toBe(CurrencyCode.EUR)
    })

    it('should handle different billing period items correctly', async () => {
      // Create billing period items with different prices and quantities
      const testBillingPeriodItem = await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 2,
        unitPrice: 150,
      })

      const result = await adminTransaction(({ transaction }) =>
        calculateFeeAndTotalAmountDueForBillingPeriod(
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

      const result = await adminTransaction(({ transaction }) =>
        calculateFeeAndTotalAmountDueForBillingPeriod(
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

      expect(result.feeCalculation).toBeDefined()
      expect(result.feeCalculation.livemode).toBe(true)
    })

    it('should handle different payment methods correctly', async () => {
      // Create a different payment method
      const testPaymentMethod = await setupPaymentMethod({
        organizationId: organization.id,
        customerId: customer.id,
        type: PaymentMethodType.Card,
      })

      const result = await adminTransaction(({ transaction }) =>
        calculateFeeAndTotalAmountDueForBillingPeriod(
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

      expect(result.feeCalculation).toBeDefined()
      expect(result.feeCalculation.paymentMethodType).toBe(
        testPaymentMethod.type
      )
    })
  })

  describe('Billing Run Retry Logic', () => {
    it('should schedule billing run retries according to the defined schedule', async () => {
      const retryTimesInDays = [3, 5, 5]
      let allBillingRunsForPeriod: BillingRun.Record[] = [billingRun]

      for (let i = 0; i < retryTimesInDays.length; i++) {
        const daysToRetry = retryTimesInDays[i]
        const retryInsert = constructBillingRunRetryInsert(
          billingRun,
          allBillingRunsForPeriod
        )

        expect(retryInsert).toBeDefined()
        const expectedRetryDate =
          Date.now() + daysToRetry * 24 * 60 * 60 * 1000
        expect(retryInsert!.scheduledFor).toBeCloseTo(
          expectedRetryDate,
          -3 // tolerance of 1 second
        )

        // Add the new retry run to the list for the next iteration
        allBillingRunsForPeriod.push({
          ...billingRun,
          ...(retryInsert as BillingRun.Insert),
          id: `retry-run-${i}`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          status: retryInsert!.status,
        } as BillingRun.Record)
      }
    })

    it('should schedule a billing run retry 3 days after the initial attempt', async () => {
      const retryBillingRun = await adminTransaction(
        ({ transaction }) =>
          scheduleBillingRunRetry(billingRun, transaction)
      )
      expect(retryBillingRun).toBeDefined()
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
      const result = await adminTransaction(
        async ({ transaction }) => {
          const futureBillingPeriod = await updateBillingPeriod(
            {
              id: billingPeriod.id,
              startDate: Date.now() + 10 * 24 * 60 * 60 * 1000, // 10 days in the future
            },
            transaction
          )
          return processNoMoreDueForBillingPeriod(
            {
              billingRun,
              billingPeriod: futureBillingPeriod,
              invoice,
            },
            transaction
          )
        }
      )
      expect(result.billingPeriod.status).toBe(
        BillingPeriodStatus.Upcoming
      )
    })

    it('should throw an error when trying to create a retry billing run for a canceled subscription', async () => {
      // Update the subscription status to canceled
      const canceledSubscription = await adminTransaction(
        async ({ transaction }) => {
          return safelyUpdateSubscriptionStatus(
            subscription,
            SubscriptionStatus.Canceled,
            transaction
          )
        }
      )

      // The database-level protection should throw an error
      await expect(
        adminTransaction(({ transaction }) =>
          scheduleBillingRunRetry(billingRun, transaction)
        )
      ).rejects.toThrow('Cannot create billing run for canceled subscription')
    })

    it('should schedule a retry billing run if the subscription is not canceled', async () => {
      // Ensure the subscription is active
      const activeSubscription = await adminTransaction(
        async ({ transaction }) => {
          return safelyUpdateSubscriptionStatus(
            subscription,
            SubscriptionStatus.Active,
            transaction
          )
        }
      )

      const retryBillingRun = await adminTransaction(
        ({ transaction }) =>
          scheduleBillingRunRetry(billingRun, transaction)
      )

      expect(retryBillingRun).toBeDefined()
      expect(retryBillingRun?.status).toBe(BillingRunStatus.Scheduled)
      expect(retryBillingRun?.subscriptionId).toBe(subscription.id)
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should throw an error if the customer does not have a Stripe customer ID', async () => {
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
      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(billingRun.id, transaction)
      )
      expect(updatedBillingRun.status).toBe(BillingRunStatus.Failed)
    })

    it('should throw an error if the payment method does not have a Stripe payment method ID', async () => {
      await adminTransaction(async ({ transaction }) => {
        await safelyUpdatePaymentMethod(
          {
            id: paymentMethod.id,
            stripePaymentMethodId: null,
          },
          transaction
        )
      })
      await executeBillingRun(billingRun.id)
      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(billingRun.id, transaction)
      )
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
    await adminTransaction(async ({ transaction }) => {
      await updateBillingRun(
        {
          id: billingRun.id,
          status: BillingRunStatus.Failed,
        },
        transaction
      )
    })

    await expect(
      executeBillingRun(billingRun.id)
    ).resolves.toBeUndefined()
  })

  describe('executeBillingRunCalculationAndBookkeepingSteps', () => {
    it('should create a new invoice when none exists for the billing period', async () => {
      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      expect(result.invoice).toBeDefined()
      expect(result.invoice.billingPeriodId).toBe(billingPeriod.id)
      expect(result.invoice.customerId).toBe(customer.id)
      expect(result.invoice.organizationId).toBe(organization.id)
      expect(result.invoice.currency).toBeDefined()
    })

    it('should use existing invoice when one exists for the billing period', async () => {
      // Create an invoice first
      const existingInvoice = await setupInvoice({
        billingPeriodId: billingPeriod.id,
        customerId: customer.id,
        organizationId: organization.id,
        priceId: staticPrice.id,
      })

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      expect(result.invoice.id).toBe(existingInvoice.id)
    })

    it('should handle zero amount due correctly', async () => {
      // Create billing period items with zero price
      await setupBillingPeriodItem({
        billingPeriodId: billingPeriod.id,
        quantity: 1,
        unitPrice: 0,
      })
      await adminTransaction(async ({ transaction }) => {
        await updateBillingPeriodItem(
          {
            ...staticBillingPeriodItem,
            unitPrice: 0,
            quantity: 1,
          },
          transaction
        )
      })
      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      // Check the billing run status after the function call
      const { updatedBillingRun } = await adminTransaction(
        async ({ transaction }) => {
          const updatedBillingRun = await selectBillingRunById(
            billingRun.id,
            transaction
          )
          return { updatedBillingRun }
        }
      )
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

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      expect(result.invoice.id).toBe(paidInvoice.id)
      expect(result.invoice.status).toBe(InvoiceStatus.Paid)
      expect(result.payment).toBeUndefined()

      // Check the billing run status after the function call
      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(billingRun.id, transaction)
      )
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
      await adminTransaction(async ({ transaction }) => {
        const initialLineItems =
          billingPeriodItemsToInvoiceLineItemInserts({
            invoiceId: invoice.id,
            billingPeriodItems: [
              {
                ...billingPeriodItems[0],
                unitPrice: 50, // Different price to verify recreation
              },
            ],
            usageOverages: [],
            billingRunId: billingRun.id,
          })
        await insertInvoiceLineItems(initialLineItems, transaction)
      })

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

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
      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      expect(result.payment).toBeDefined()
      if (result.payment) {
        expect(result.payment.subscriptionId).toBe(
          billingPeriod.subscriptionId
        )
        expect(result.payment.billingPeriodId).toBe(billingPeriod.id)
        expect(result.payment.amount).toBe(result.totalDueAmount)
        expect(result.payment.currency).toBe(result.invoice.currency)
        expect(result.payment.paymentMethodId).toBe(
          billingRun.paymentMethodId
        )
        expect(result.payment.organizationId).toBe(organization.id)
        expect(result.payment.customerId).toBe(customer.id)
        expect(result.payment.invoiceId).toBe(result.invoice.id)
        expect(result.payment.taxCountry).toBeDefined()
        expect(result.payment.paymentMethod).toBe(paymentMethod.type)
        expect(result.payment.stripePaymentIntentId).toContain(
          'placeholder____'
        )
        expect(result.payment.livemode).toBe(billingPeriod.livemode)
      }
    })

    it('should update billing run status to AwaitingPaymentConfirmation', async () => {
      await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      // Check the billing run status after the function call
      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(billingRun.id, transaction)
      )
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
      await adminTransaction(async ({ transaction }) => {
        await updateBillingPeriodItem(
          {
            ...staticBillingPeriodItem,
            unitPrice: 0,
            quantity: 1,
          },
          transaction
        )
      })

      await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      // Check the billing run status after the function call
      const updatedBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(billingRun.id, transaction)
      )
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

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      // If the billing period is in the past, it should be marked as Completed
      if (Date.now() > billingPeriod.endDate) {
        expect(result.billingPeriod.status).toBe(
          BillingPeriodStatus.Completed
        )
      }
    })

    it('should create fee calculation with correct properties', async () => {
      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      expect(result.feeCalculation).toBeDefined()
      expect(result.feeCalculation.currency).toBeDefined()
    })

    it('should return all expected properties in the result object', async () => {
      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      expect(result.invoice).toBeDefined()
      expect(result.payment).toBeDefined()
      expect(result.feeCalculation).toBeDefined()
      expect(result.customer).toBeDefined()
      expect(result.organization).toBeDefined()
      expect(result.billingPeriod).toBeDefined()
      expect(result.subscription).toBeDefined()
      expect(result.paymentMethod).toBeDefined()
      expect(result.totalDueAmount).toBeDefined()
      expect(result.totalAmountPaid).toBeDefined()
      expect(result.payments).toBeDefined()
    })

    it('should handle nested billing details address for tax country', async () => {
      const billingAddress: PaymentMethod.BillingDetails =
        paymentMethod.billingDetails
      // Update payment method with nested address
      await adminTransaction(async ({ transaction }) => {
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
      })

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      if (result.payment) {
        expect(result.payment.taxCountry).toBe('US')
      }
    })

    it('should handle non-nested billing details address for tax country', async () => {
      // Update payment method with non-nested address
      await adminTransaction(async ({ transaction }) => {
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
      })

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      if (result.payment) {
        expect(result.payment.taxCountry).toBe('CA')
      }
    })

    it('should handle multiple payments for billing period', async () => {
      // Create a payment for the billing period
      await adminTransaction(async ({ transaction }) => {
        await insertPayment(
          {
            amount: 50,
            currency: CurrencyCode.USD,
            status: PaymentStatus.Succeeded,
            organizationId: organization.id,
            chargeDate: Date.now(),
            customerId: customer.id,
            invoiceId: (
              await setupInvoice({
                billingPeriodId: billingPeriod.id,
                customerId: customer.id,
                organizationId: organization.id,
                priceId: staticPrice.id,
              })
            ).id,
            paymentMethodId: paymentMethod.id,
            refunded: false,
            refundedAmount: 0,
            refundedAt: null,
            taxCountry: CountryCode.US,
            paymentMethod: paymentMethod.type,
            stripePaymentIntentId: 'pi_test',
            livemode: billingPeriod.livemode,
            subscriptionId: billingPeriod.subscriptionId,
            billingPeriodId: billingPeriod.id,
          },
          transaction
        )
      })

      const result = await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      expect(result.totalAmountPaid).toBe(50)
      expect(result.payments.length).toBeGreaterThan(0)
    })

    it('should throw an error if customer has no stripe customer ID', async () => {
      // Update customer to remove stripe customer ID
      await adminTransaction(async ({ transaction }) => {
        await updateCustomer(
          {
            id: customer.id,
            stripeCustomerId: null,
          },
          transaction
        )
      })

      await expect(
        adminTransaction(({ transaction }) =>
          executeBillingRunCalculationAndBookkeepingSteps(
            billingRun,
            transaction
          )
        )
      ).rejects.toThrow(
        'Cannot run billing for a billing period with a customer that does not have a stripe customer id'
      )
    })

    it('should throw an error if payment method has no stripe payment method ID', async () => {
      // Update payment method to remove stripe payment method ID
      await adminTransaction(async ({ transaction }) => {
        await updatePaymentMethod(
          {
            id: paymentMethod.id,
            stripePaymentMethodId: null,
          },
          transaction
        )
      })

      await expect(
        adminTransaction(({ transaction }) =>
          executeBillingRunCalculationAndBookkeepingSteps(
            billingRun,
            transaction
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
      await adminTransaction(async ({ transaction }) => {
        const { rawOutstandingUsageCosts } =
          await tabulateOutstandingUsageCosts(
            subscription.id,
            billingPeriod.endDate,
            transaction
          )
        expect(rawOutstandingUsageCosts.length).toBe(1)
        expect(rawOutstandingUsageCosts[0].usageEventId).toBe(
          usageEvent.id
        )
      })

      // 2. Action
      await adminTransaction(({ transaction }) =>
        executeBillingRunCalculationAndBookkeepingSteps(
          billingRun,
          transaction
        )
      )

      // 3. Assert: The ledger entry should now be "claimed" by the billing run
      const [updatedEntry] = await adminTransaction(
        ({ transaction }) =>
          selectLedgerEntries(
            {
              sourceUsageEventId: usageEvent.id,
              entryType: LedgerEntryType.UsageCost,
            },
            transaction
          )
      )
      expect(updatedEntry).toBeDefined()
      expect(updatedEntry!.claimedByBillingRunId).toBe(billingRun.id)
    })

    it('should succeed and mark invoice as Paid if amount to charge is zero due to overpayment', async () => {
      // 1. Setup: Create a payment that overpays the due amount.
      // Total due is staticBillingPeriodItem.unitPrice (50)
      await adminTransaction(async ({ transaction }) => {
        await insertPayment(
          {
            amount: 1000000, // Overpayment
            currency: CurrencyCode.USD,
            status: PaymentStatus.Succeeded,
            organizationId: organization.id,
            chargeDate: Date.now(),
            customerId: customer.id,
            invoiceId: (
              await setupInvoice({
                billingPeriodId: billingPeriod.id,
                customerId: customer.id,
                organizationId: organization.id,
                priceId: staticPrice.id,
              })
            ).id,
            paymentMethodId: paymentMethod.id,
            refunded: false,
            refundedAmount: 0,
            refundedAt: null,
            taxCountry: CountryCode.US,
            paymentMethod: paymentMethod.type,
            stripePaymentIntentId: 'pi_overpayment_test',
            livemode: billingPeriod.livemode,
            subscriptionId: billingPeriod.subscriptionId,
            billingPeriodId: billingPeriod.id,
          },
          transaction
        )
      })
      core.IS_TEST = true

      // 2. Action
      await executeBillingRun(billingRun.id)

      // 3. Assert
      const finalBillingRun = await adminTransaction(
        ({ transaction }) =>
          selectBillingRunById(billingRun.id, transaction)
      )
      const finalInvoice = (
        await adminTransaction(({ transaction }) =>
          selectInvoices(
            { billingPeriodId: billingPeriod.id },
            transaction
          )
        )
      )[0]

      expect(finalBillingRun.status).toBe(BillingRunStatus.Succeeded)
      expect(finalInvoice.status).toBe(InvoiceStatus.Paid)
    })

    it('should filter out Static items with a zero quantity', () => {
      const staticBpiWithZeroQuantity = {
        ...staticBillingPeriodItem,
        quantity: 0,
      }
      const lineItems = billingPeriodItemsToInvoiceLineItemInserts({
        invoiceId: 'some-invoice-id',
        billingRunId: billingRun.id,
        billingPeriodItems: [staticBpiWithZeroQuantity],
        usageOverages: [],
      })
      expect(lineItems.length).toBe(0)
    })

    it('should return quantity 0 if usageEventsPerUnit is null', () => {
      const usageBpiWithNull = {
        ...usageBillingPeriodItem,
        usageEventsPerUnit: null,
        type: SubscriptionItemType.Usage,
      }
      const usageOverages = [
        {
          usageMeterId: usageMeter.id,
          balance: 100,
          ledgerAccountId: ledgerAccount.id,
        },
      ]
      const lineItems = billingPeriodItemsToInvoiceLineItemInserts({
        invoiceId: 'some-invoice-id',
        billingRunId: billingRun.id,
        billingPeriodItems: [
          {
            ...usageBpiWithNull,
            usageMeterId: usageMeter.id,
            usageEventsPerUnit: 0,
            type: SubscriptionItemType.Usage,
          },
        ],
        usageOverages,
      })
      expect(lineItems.length).toBe(0)
    })

    it('should not create line items if usageEventsPerUnit is 0', () => {
      const usageBpiWithZero = {
        ...usageBillingPeriodItem,
        usageEventsPerUnit: 0,
      }
      const usageOverages = [
        {
          usageMeterId: usageMeter.id,
          balance: 100,
          ledgerAccountId: ledgerAccount.id,
        },
      ]
      const lineItems = billingPeriodItemsToInvoiceLineItemInserts({
        invoiceId: 'some-invoice-id',
        billingRunId: billingRun.id,
        billingPeriodItems: [
          {
            ...usageBpiWithZero,
            usageMeterId: usageMeter.id,
            type: SubscriptionItemType.Usage,
          },
        ],
        usageOverages,
      })
      expect(lineItems.length).toBe(0)
    })

    it('should ignore usage overages that do not have a matching billing period item', () => {
      const usageOverages = [
        {
          usageMeterId: 'some-other-meter-id',
          balance: 100,
          ledgerAccountId: 'some-other-account-id',
        },
      ]
      const lineItems = billingPeriodItemsToInvoiceLineItemInserts({
        invoiceId: 'some-invoice-id',
        billingRunId: billingRun.id,
        billingPeriodItems: [staticBillingPeriodItem], // Does not contain a matching usage item
        usageOverages,
      })

      expect(lineItems.length).toBe(1)
      expect(lineItems[0].type).toBe(SubscriptionItemType.Static)
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
        productId: product.id,
        name: 'Metered Price For Tabulation',
        type: PriceType.Usage,
        unitPrice: 10,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        setupFeeAmount: 0,
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
      await adminTransaction(async ({ transaction }) => {
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
      })
    })

    it('should return empty results when ledger accounts exist but have no outstanding costs', async () => {
      const ledgerAccount = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
      })
      await adminTransaction(async ({ transaction }) => {
        const result = await tabulateOutstandingUsageCosts(
          subscription.id,
          billingPeriod.endDate,
          transaction
        )

        expect(
          result.outstandingUsageCostsByLedgerAccountId.size
        ).toBe(0)
        expect(result.rawOutstandingUsageCosts.length).toBe(0)
      })
    })

    it('should correctly tabulate a single outstanding usage cost for one ledger account', async () => {
      const ledgerAccount = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
      })
      await adminTransaction(async ({ transaction }) => {
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
        expect(rawCost.usageEventId).toBe(usageEvent.id)
        expect(rawCost.balance).toBe(100)

        expect(
          result.outstandingUsageCostsByLedgerAccountId.size
        ).toBe(1)
        const aggregatedCost =
          result.outstandingUsageCostsByLedgerAccountId.get(
            ledgerAccount.id
          )
        expect(aggregatedCost).toBeDefined()
        expect(aggregatedCost?.ledgerAccountId).toBe(ledgerAccount.id)
        expect(aggregatedCost?.usageMeterId).toBe(usageMeter.id)
        expect(aggregatedCost?.subscriptionId).toBe(subscription.id)
        expect(aggregatedCost?.outstandingBalance).toBe(100)
      })
    })

    it('should handle multiple outstanding usage costs for one ledger account (map behavior)', async () => {
      const ledgerAccount = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
      })
      await adminTransaction(async ({ transaction }) => {
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

        expect(result.rawOutstandingUsageCosts.length).toBe(2)
        const sortedRawCosts = [
          ...result.rawOutstandingUsageCosts,
        ].sort((a, b) => a.balance - b.balance)
        expect(sortedRawCosts[0].balance).toBe(usageEvent2.amount)
        expect(sortedRawCosts[1].balance).toBe(usageEvent1.amount)

        expect(
          result.outstandingUsageCostsByLedgerAccountId.size
        ).toBe(1)
        const aggregatedCost =
          result.outstandingUsageCostsByLedgerAccountId.get(
            ledgerAccount.id
          )
        expect(aggregatedCost).toBeDefined()
        expect(aggregatedCost?.outstandingBalance).toBe(
          usageEvent1.amount + usageEvent2.amount
        )
        expect(aggregatedCost?.usageMeterId).toBe(usageMeter.id)
      })
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

      await adminTransaction(async ({ transaction }) => {
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
        expect(aggCostLa1).toEqual<OutstandingUsageCostAggregation>({
          ledgerAccountId: la1.id,
          usageMeterId: usageMeter.id,
          subscriptionId: subscription.id,
          outstandingBalance: 100,
        })

        const aggCostLa3 =
          result.outstandingUsageCostsByLedgerAccountId.get(la3.id)
        expect(aggCostLa3).toEqual<OutstandingUsageCostAggregation>({
          ledgerAccountId: la3.id,
          usageMeterId: usageMeter.id,
          subscriptionId: subscription.id,
          outstandingBalance: 200,
        })

        expect(
          result.outstandingUsageCostsByLedgerAccountId.has(la2.id)
        ).toBe(false)
      })
    })

    it('should only include usage costs up to the billingPeriodEndDate', async () => {
      const ledgerAccount = await setupLedgerAccount({
        organizationId: organization.id,
        subscriptionId: subscription.id,
        usageMeterId: usageMeter.id,
        livemode: true,
      })

      await adminTransaction(async ({ transaction }) => {
        const billingPeriodEndDate = new Date()
        const billingPeriod = await setupBillingPeriod({
          subscriptionId: subscription.id,
          startDate: new Date(
            billingPeriodEndDate.getTime() - 30 * 24 * 60 * 60 * 1000
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
        expect(aggregatedCost).toBeDefined()
        expect(aggregatedCost?.outstandingBalance).toBe(150)
      })
    })
  })

  describe('billingPeriodItemsToInvoiceLineItemInserts', () => {
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
      const lineItems = billingPeriodItemsToInvoiceLineItemInserts({
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
        },
      ]

      const lineItems = billingPeriodItemsToInvoiceLineItemInserts({
        invoiceId: invoice.id,
        billingRunId: billingRun.id,
        billingPeriodItems: [usageBillingPeriodItem],
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
        },
      ]

      const lineItems = billingPeriodItemsToInvoiceLineItemInserts({
        invoiceId: invoice.id,
        billingRunId: billingRun.id,
        billingPeriodItems: [usageBillingPeriodItem],
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
        },
      ]
      const lineItems = billingPeriodItemsToInvoiceLineItemInserts({
        invoiceId: invoice.id,
        billingRunId: billingRun.id,
        billingPeriodItems, // Contains both static and usage items from beforeEach
        usageOverages,
      })

      expect(lineItems.length).toBe(2)
      const staticItem = lineItems.find(
        (item) => item.type === SubscriptionItemType.Static
      )
      const usageItem = lineItems.find(
        (item) => item.type === SubscriptionItemType.Usage
      )
      expect(staticItem).toBeDefined()
      expect(usageItem).toBeDefined()
    })

    it('should return quantity 0 if usageEventsPerUnit is null', () => {
      const usageBpiWithNull = {
        ...usageBillingPeriodItem,
        usageEventsPerUnit: null,
        type: SubscriptionItemType.Usage,
      }
      const usageOverages = [
        {
          usageMeterId: usageMeter.id,
          balance: 100,
          ledgerAccountId: ledgerAccount.id,
        },
      ]
      const lineItems = billingPeriodItemsToInvoiceLineItemInserts({
        invoiceId: invoice.id,
        billingRunId: billingRun.id,
        billingPeriodItems: [
          {
            ...usageBpiWithNull,
            usageMeterId: usageMeter.id,
            usageEventsPerUnit: 0,
            type: SubscriptionItemType.Usage,
          },
        ],
        usageOverages,
      })
      expect(lineItems.length).toBe(0)
    })

    it('should not create line items if usageEventsPerUnit is 0', () => {
      const usageBpiWithZero = {
        ...usageBillingPeriodItem,
        usageEventsPerUnit: 0,
      }
      const usageOverages = [
        {
          usageMeterId: usageMeter.id,
          balance: 100,
          ledgerAccountId: ledgerAccount.id,
        },
      ]
      const lineItems = billingPeriodItemsToInvoiceLineItemInserts({
        invoiceId: invoice.id,
        billingRunId: billingRun.id,
        billingPeriodItems: [
          {
            ...usageBpiWithZero,
            usageMeterId: usageMeter.id,
            type: SubscriptionItemType.Usage,
          },
        ],
        usageOverages,
      })
      expect(lineItems.length).toBe(0)
    })

    it('should ignore usage overages that do not have a matching billing period item', () => {
      const usageOverages = [
        {
          usageMeterId: 'some-other-meter-id',
          balance: 100,
          ledgerAccountId: 'some-other-account-id',
        },
      ]
      const lineItems = billingPeriodItemsToInvoiceLineItemInserts({
        invoiceId: invoice.id,
        billingRunId: billingRun.id,
        billingPeriodItems: [staticBillingPeriodItem], // Does not contain a matching usage item
        usageOverages,
      })

      expect(lineItems.length).toBe(1)
      expect(lineItems[0].type).toBe(SubscriptionItemType.Static)
    })
  })

  describe('safelyInsertBillingRun Protection', () => {
    it('should prevent ALL billing run creation for canceled subscriptions', async () => {
      // Cancel the subscription
      await adminTransaction(async ({ transaction }) => {
        await safelyUpdateSubscriptionStatus(
          subscription,
          SubscriptionStatus.Canceled,
          transaction
        )
      })

      // Test 1: Direct safelyInsertBillingRun call should fail
      await expect(
        adminTransaction(async ({ transaction }) => {
          return safelyInsertBillingRun(
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
        })
      ).rejects.toThrow('Cannot create billing run for canceled subscription')

      // Test 2: createBillingRun should fail
      await expect(
        adminTransaction(async ({ transaction }) => {
          return createBillingRun(
            {
              billingPeriod,
              paymentMethod,
              scheduledFor: Date.now(),
            },
            transaction
          )
        })
      ).rejects.toThrow('Cannot create billing run for canceled subscription')

      // Test 3: scheduleBillingRunRetry should fail
      await expect(
        adminTransaction(async ({ transaction }) => {
          return scheduleBillingRunRetry(billingRun, transaction)
        })
      ).rejects.toThrow('Cannot create billing run for canceled subscription')
    })

    it('should allow billing run creation for active subscriptions', async () => {
      // Ensure subscription is active
      await adminTransaction(async ({ transaction }) => {
        await safelyUpdateSubscriptionStatus(
          subscription,
          SubscriptionStatus.Active,
          transaction
        )
      })

      // All billing run creation methods should work
      const directInsert = await adminTransaction(async ({ transaction }) => {
        return safelyInsertBillingRun(
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
      })
      expect(directInsert).toBeDefined()

      const createBillingRunResult = await adminTransaction(async ({ transaction }) => {
        return createBillingRun(
          {
            billingPeriod,
            paymentMethod,
            scheduledFor: Date.now(),
          },
          transaction
        )
      })
      expect(createBillingRunResult).toBeDefined()

      const retryResult = await adminTransaction(async ({ transaction }) => {
        return scheduleBillingRunRetry(billingRun, transaction)
      })
      expect(retryResult).toBeDefined()
    })
  })
})
