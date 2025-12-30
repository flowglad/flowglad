import { beforeEach, describe, expect, it } from 'vitest'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Country } from '@/db/schema/countries'
import type { InvoiceLineItem } from '@/db/schema/invoiceLineItems'
import type { Invoice } from '@/db/schema/invoices'
import type {
  BillingAddress,
  Organization,
} from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import {
  CountryCode,
  CurrencyCode,
  PaymentMethodType,
  StripeConnectContractType,
} from '@/types'
import {
  createCheckoutSessionFeeCalculationInsertForInvoice,
  createCheckoutSessionFeeCalculationInsertForPrice,
} from '@/utils/bookkeeping/fees/checkoutSession'

describe('createCheckoutSessionFeeCalculationInsertForPrice', () => {
  it('returns taxAmount = 0 and stripeTaxCalculationId null when calculating fee for organization with StripeConnectContractType Platform', async () => {
    const organization = {
      id: 'org_1',
      stripeConnectContractType: StripeConnectContractType.Platform,
      feePercentage: '1.0',
    } as Organization.Record

    const product = {
      id: 'prod_1',
      livemode: true,
    } as Product.Record

    const price = {
      id: 'price_1',
      unitPrice: 1000,
      currency: CurrencyCode.USD,
      livemode: true,
    } as Price.Record

    const checkoutSession = {
      id: 'sess_1',
      paymentMethodType: PaymentMethodType.Card,
      billingAddress: {
        address: { country: CountryCode.US },
      } as BillingAddress,
    } as CheckoutSession.FeeReadyRecord

    const organizationCountry = {
      code: CountryCode.US,
    } as Country.Record

    const feeCalculationInsert =
      await createCheckoutSessionFeeCalculationInsertForPrice({
        organization,
        product,
        price,
        purchase: undefined,
        discount: undefined,
        checkoutSessionId: checkoutSession.id,
        billingAddress: checkoutSession.billingAddress!,
        paymentMethodType: checkoutSession.paymentMethodType!,
        organizationCountry,
        livemode: true,
      })

    expect(feeCalculationInsert.taxAmountFixed).toBe(0)
    expect(feeCalculationInsert.stripeTaxCalculationId).toBeNull()
    expect(feeCalculationInsert.morSurchargePercentage).toBe('0')
  })
})

describe('createCheckoutSessionFeeCalculationInsertForInvoice', () => {
  it('builds correct insert for a domestic invoice checkout session', async () => {
    const organization = {
      id: 'org_domestic',
      stripeConnectContractType: StripeConnectContractType.Platform,
      feePercentage: '2.5',
    } as Organization.Record
    const organizationCountry = {
      code: CountryCode.US,
    } as Country.Record
    const invoice = {
      id: 'inv1',
      currency: CurrencyCode.USD,
      livemode: false,
    } as Invoice.Record
    const invoiceLineItems = [
      { price: 1000, quantity: 2 },
      { price: 500, quantity: 1 },
    ] as InvoiceLineItem.ClientRecord[]
    const billingAddress = {
      address: { country: CountryCode.US },
    } as BillingAddress

    const insert =
      await createCheckoutSessionFeeCalculationInsertForInvoice({
        organization,
        invoice,
        invoiceLineItems,
        billingAddress,
        paymentMethodType: PaymentMethodType.Card,
        checkoutSessionId: 'sess_inv_domestic',
        organizationCountry,
      })

    // Base amount = 1000*2 + 500*1 = 2500
    expect(insert.baseAmount).toBe(2500)
    expect(insert.pretaxTotal).toBe(2500)
    expect(insert.discountAmountFixed).toBe(0)
    expect(insert.flowgladFeePercentage).toBe('2.5')
    expect(insert.internationalFeePercentage).toBe('0')
    // Payment method fee: 2.9%+30 on 2500
    const expectedPaymentFee = Math.round(2500 * 0.029 + 30)
    expect(insert.paymentMethodFeeFixed).toBe(expectedPaymentFee)
    expect(insert.taxAmountFixed).toBe(0)
    expect(insert.stripeTaxCalculationId).toBeNull()
    expect(insert.stripeTaxTransactionId).toBeNull()
    expect(insert.morSurchargePercentage).toBe('0')
  })

  it('applies international fee for an invoice session with non-domestic address', async () => {
    const organization = {
      id: 'org_intl',
      stripeConnectContractType: StripeConnectContractType.Platform,
      feePercentage: '3.0',
    } as Organization.Record
    const organizationCountry = {
      code: CountryCode.US,
    } as Country.Record
    const invoice = {
      id: 'inv2',
      currency: CurrencyCode.USD,
      livemode: true,
    } as Invoice.Record
    const invoiceLineItems = [
      { price: 2000, quantity: 1 },
    ] as InvoiceLineItem.ClientRecord[]
    const billingAddress = {
      address: { country: CountryCode.GB },
    } as BillingAddress

    const insert =
      await createCheckoutSessionFeeCalculationInsertForInvoice({
        organization,
        invoice,
        invoiceLineItems,
        billingAddress,
        paymentMethodType: PaymentMethodType.Card,
        checkoutSessionId: 'sess_inv_intl',
        organizationCountry,
      })

    // Base amount = 2000
    expect(insert.baseAmount).toBe(2000)
    expect(insert.internationalFeePercentage).toBe('1.5')
    expect(insert.flowgladFeePercentage).toBe('3')
    // PretaxTotal = 2000
    expect(insert.pretaxTotal).toBe(2000)
    // Payment method fee: 2.9%+30 on 2000
    const expectedPaymentFee = Math.round(2000 * 0.029 + 30)
    expect(insert.paymentMethodFeeFixed).toBe(expectedPaymentFee)
    expect(insert.morSurchargePercentage).toBe('0')
  })

  it('sets morSurchargePercentage to 1.1 for MerchantOfRecord invoice fee calculations', async () => {
    const organization = {
      id: 'org_mor',
      stripeConnectContractType:
        StripeConnectContractType.MerchantOfRecord,
      feePercentage: '2.5',
    } as Organization.Record
    const organizationCountry = {
      code: CountryCode.US,
    } as Country.Record
    const invoice = {
      id: 'inv_mor',
      currency: CurrencyCode.USD,
      livemode: false,
    } as Invoice.Record
    const invoiceLineItems = [
      { price: 1000, quantity: 1 },
    ] as InvoiceLineItem.ClientRecord[]
    const billingAddress = {
      address: { country: CountryCode.US },
    } as BillingAddress

    const insert =
      await createCheckoutSessionFeeCalculationInsertForInvoice({
        organization,
        invoice,
        invoiceLineItems,
        billingAddress,
        paymentMethodType: PaymentMethodType.Card,
        checkoutSessionId: 'sess_inv_mor',
        organizationCountry,
      })

    // Base amount = 1000*1 = 1000
    expect(insert.baseAmount).toBe(1000)
    expect(insert.pretaxTotal).toBe(1000)
    expect(insert.discountAmountFixed).toBe(0)
    expect(insert.flowgladFeePercentage).toBe('2.5')
    expect(insert.morSurchargePercentage).toBe('1.1')
    expect(insert.internationalFeePercentage).toBe('0')

    // Payment method fee: 2.9%+30 on 1000
    const expectedPaymentFee = Math.round(1000 * 0.029 + 30)
    expect(insert.paymentMethodFeeFixed).toBe(expectedPaymentFee)

    // MoR invoice fee calc does not calculate taxes (only MoR checkout sessions for Price do, currently)
    expect(insert.taxAmountFixed).toBe(0)
    expect(insert.stripeTaxCalculationId).toBeNull()
    expect(insert.stripeTaxTransactionId).toBeNull()

    expect(insert.currency).toBe(CurrencyCode.USD)
    expect(insert.livemode).toBe(false)
    expect(insert.organizationId).toBe(organization.id)
    expect(insert.checkoutSessionId).toBe('sess_inv_mor')
    expect(insert.paymentMethodType).toBe(PaymentMethodType.Card)
    expect(insert.billingAddress).toEqual(billingAddress)
    expect(insert.billingPeriodId).toBeNull()
    expect(insert.priceId).toBeNull()
    expect(insert.discountId).toBeNull()
    expect(insert.purchaseId).toBeNull()
  })
})
