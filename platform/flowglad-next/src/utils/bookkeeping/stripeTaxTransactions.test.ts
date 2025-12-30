import { describe, expect, it } from 'vitest'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPurchase,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import {
  insertFeeCalculation,
  selectFeeCalculationById,
} from '@/db/tableMethods/feeCalculationMethods'
import { selectPaymentById } from '@/db/tableMethods/paymentMethods'
import {
  CountryCode,
  CurrencyCode,
  FeeCalculationType,
  PaymentMethodType,
  PaymentStatus,
  StripeConnectContractType,
} from '@/types'
import { createStripeTaxTransactionFromCalculation } from '@/utils/stripe'
import { createStripeTaxTransactionIfNeededForPayment } from './stripeTaxTransactions'

describe('createStripeTaxTransactionFromCalculation', () => {
  it('returns null for notaxoverride_ calculation IDs', async () => {
    const result = await createStripeTaxTransactionFromCalculation({
      stripeTaxCalculationId: 'notaxoverride_abc123',
      reference: 'ref_123',
      livemode: false,
    })
    expect(result).toBeNull()
  })

  it('creates a tax transaction from calculation ID', async () => {
    const result = await createStripeTaxTransactionFromCalculation({
      stripeTaxCalculationId: 'txcalc_test_123',
      reference: 'ref_123',
      livemode: false,
    })
    expect(result?.id).toMatch(/^tax_txn_/)
  })
})

describe('createStripeTaxTransactionIfNeededForPayment', () => {
  it('creates and stores Stripe Tax Transaction for MoR payment', async () => {
    const { organization, price } = await setupOrg({
      stripeConnectContractType:
        StripeConnectContractType.MerchantOfRecord,
    })
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const purchase = await setupPurchase({
      customerId: customer.id,
      organizationId: organization.id,
      priceId: price.id,
    })
    const invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      purchaseId: purchase.id,
    })
    const payment = await setupPayment({
      stripeChargeId: 'ch_tax_txn_test_1',
      status: PaymentStatus.Succeeded,
      amount: 1100,
      livemode: false,
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      purchaseId: purchase.id,
    })

    const { updatedPayment, updatedFeeCalculation } =
      await adminTransaction(async ({ transaction }) => {
        const feeCalculation = await insertFeeCalculation(
          {
            organizationId: organization.id,
            checkoutSessionId: null,
            purchaseId: purchase.id,
            discountId: null,
            priceId: price.id,
            livemode: false,
            currency: CurrencyCode.USD,
            type: FeeCalculationType.CheckoutSessionPayment,
            billingPeriodId: null,
            paymentMethodType: PaymentMethodType.Card,
            discountAmountFixed: 0,
            paymentMethodFeeFixed: 0,
            baseAmount: 1000,
            pretaxTotal: 1000,
            taxAmountFixed: 100,
            stripeTaxCalculationId: 'txcalc_test_abc',
            stripeTaxTransactionId: null,
            internationalFeePercentage: '0',
            flowgladFeePercentage: '0.65',
            morSurchargePercentage: '0',
            billingAddress: {
              address: {
                line1: '123 Test St',
                line2: 'Apt 1',
                city: 'Test City',
                state: 'Test State',
                postal_code: '12345',
                country: CountryCode.US,
              },
            },
            internalNotes: 'Tax txn test fee calculation',
          },
          transaction
        )

        await createStripeTaxTransactionIfNeededForPayment(
          { organization, payment, invoice },
          transaction
        )

        const updatedPayment = await selectPaymentById(
          payment.id,
          transaction
        )
        const updatedFeeCalculation = await selectFeeCalculationById(
          feeCalculation.id,
          transaction
        )

        if (!updatedPayment || !updatedFeeCalculation) {
          throw new Error('Expected records to exist')
        }
        return { updatedPayment, updatedFeeCalculation }
      })

    expect(updatedPayment.stripeTaxTransactionId).toMatch(/^tax_txn_/)
    expect(updatedFeeCalculation.stripeTaxTransactionId).toBe(
      updatedPayment.stripeTaxTransactionId
    )
  })

  it('skips Stripe Tax Transaction for Platform payments', async () => {
    const { organization, price } = await setupOrg({
      stripeConnectContractType: StripeConnectContractType.Platform,
    })
    const customer = await setupCustomer({
      organizationId: organization.id,
    })
    const purchase = await setupPurchase({
      customerId: customer.id,
      organizationId: organization.id,
      priceId: price.id,
    })
    const invoice = await setupInvoice({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: price.id,
      purchaseId: purchase.id,
    })
    const payment = await setupPayment({
      stripeChargeId: 'ch_tax_txn_test_2',
      status: PaymentStatus.Succeeded,
      amount: 1100,
      livemode: false,
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      purchaseId: purchase.id,
    })

    const stripeTaxTransactionId = await adminTransaction(
      async ({ transaction }) => {
        await insertFeeCalculation(
          {
            organizationId: organization.id,
            checkoutSessionId: null,
            purchaseId: purchase.id,
            discountId: null,
            priceId: price.id,
            livemode: false,
            currency: CurrencyCode.USD,
            type: FeeCalculationType.CheckoutSessionPayment,
            billingPeriodId: null,
            paymentMethodType: PaymentMethodType.Card,
            discountAmountFixed: 0,
            paymentMethodFeeFixed: 0,
            baseAmount: 1000,
            pretaxTotal: 1000,
            taxAmountFixed: 100,
            stripeTaxCalculationId: 'txcalc_test_platform',
            stripeTaxTransactionId: null,
            internationalFeePercentage: '0',
            flowgladFeePercentage: '0.65',
            morSurchargePercentage: '0',
            billingAddress: {
              address: {
                line1: '123 Test St',
                line2: 'Apt 1',
                city: 'Test City',
                state: 'Test State',
                postal_code: '12345',
                country: CountryCode.US,
              },
            },
            internalNotes: 'Tax txn test fee calculation',
          },
          transaction
        )

        return createStripeTaxTransactionIfNeededForPayment(
          { organization, payment, invoice },
          transaction
        )
      }
    )

    expect(stripeTaxTransactionId).toBeNull()
  })
})
