import { describe, expect, it } from 'vitest'
import type { CheckoutSession } from '@/db/schema/checkoutSessions'
import type { Country } from '@/db/schema/countries'
import type {
  BillingAddress,
  Organization,
} from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import {
  CountryCode,
  CurrencyCode,
  PaymentMethodType,
  StripeConnectContractType,
} from '@/types'
import { createCheckoutSessionFeeCalculationInsertForPrice } from '@/utils/bookkeeping/fees/checkoutSession'

describe('createCheckoutSessionFeeCalculationInsertForPrice', () => {
  it('returns taxAmount = 0 and stripeTaxCalculationId null when calculating fee for organization with StripeConnectContractType Platform', async () => {
    const organization = {
      id: 'org_1',
      stripeConnectContractType: StripeConnectContractType.Platform,
      feePercentage: '1.0',
    } as Organization.Record

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

  it('sets morSurchargePercentage when calculating fee for MerchantOfRecord organizations', async () => {
    const organization = {
      id: 'org_mor',
      stripeConnectContractType:
        StripeConnectContractType.MerchantOfRecord,
      feePercentage: '1.0',
    } as Organization.Record

    const price = {
      id: 'price_1',
      // Use 0 to avoid hitting Stripe Tax API (calculateTaxes fast-path).
      unitPrice: 0,
      currency: CurrencyCode.USD,
      livemode: true,
    } as Price.Record

    const checkoutSession = {
      id: 'sess_mor',
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
        price,
        purchase: undefined,
        discount: undefined,
        checkoutSessionId: checkoutSession.id,
        billingAddress: checkoutSession.billingAddress!,
        paymentMethodType: checkoutSession.paymentMethodType!,
        organizationCountry,
        livemode: true,
      })

    expect(feeCalculationInsert.morSurchargePercentage).toBe('1.1')
  })
})
