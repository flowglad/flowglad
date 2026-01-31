import { describe, expect, it } from 'bun:test'
import {
  CountryCode,
  CurrencyCode,
  FeeCalculationType,
  PaymentMethodType,
  PaymentStatus,
  StripeConnectContractType,
} from '@db-core/enums'
import { Result } from 'better-result'
import {
  setupCustomer,
  setupInvoice,
  setupOrg,
  setupPayment,
  setupPurchase,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import {
  insertFeeCalculation,
  selectFeeCalculationById,
} from '@/db/tableMethods/feeCalculationMethods'
import { selectPaymentById } from '@/db/tableMethods/paymentMethods'
import { nanoid } from '@/utils/core'
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
    // Just verify we get a result back - don't assert on mock response format
    expect(typeof result?.id).toBe('string')
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
      stripeChargeId: `ch_${nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 1100,
      livemode: false,
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      purchaseId: purchase.id,
    })

    const { updatedPayment, updatedFeeCalculation } = (
      await adminTransactionWithResult(async ({ transaction }) => {
        const feeCalculation = await insertFeeCalculation(
          {
            organizationId: organization.id,
            checkoutSessionId: null,
            purchaseId: purchase.id,
            discountId: null,
            priceId: price.id,
            pricingModelId: price.pricingModelId,
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

        const updatedPayment = (
          await selectPaymentById(payment.id, transaction)
        ).unwrap()
        const updatedFeeCalculation = (
          await selectFeeCalculationById(
            feeCalculation.id,
            transaction
          )
        ).unwrap()

        return Result.ok(
          await { updatedPayment, updatedFeeCalculation }
        )
      })
    ).unwrap()

    // Just verify a tax transaction ID was stored - don't assert on mock response format
    expect(typeof updatedPayment.stripeTaxTransactionId).toBe(
      'string'
    )
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
      stripeChargeId: `ch_${nanoid()}`,
      status: PaymentStatus.Succeeded,
      amount: 1100,
      livemode: false,
      organizationId: organization.id,
      customerId: customer.id,
      invoiceId: invoice.id,
      purchaseId: purchase.id,
    })

    const stripeTaxTransactionId = (
      await adminTransactionWithResult(async ({ transaction }) => {
        await insertFeeCalculation(
          {
            organizationId: organization.id,
            checkoutSessionId: null,
            purchaseId: purchase.id,
            discountId: null,
            priceId: price.id,
            pricingModelId: price.pricingModelId,
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

        return Result.ok(
          await createStripeTaxTransactionIfNeededForPayment(
            { organization, payment, invoice },
            transaction
          )
        )
      })
    ).unwrap()

    expect(stripeTaxTransactionId).toBeNull()
  })
})
