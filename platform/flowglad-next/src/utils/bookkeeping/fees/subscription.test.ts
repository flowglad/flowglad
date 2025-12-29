import { beforeEach, describe, expect, it } from 'vitest'
import {
  setupBillingPeriod,
  setupCustomer,
  setupDiscount,
  setupOrg,
  setupPaymentMethod,
  setupSubscription,
  setupUsageMeter,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import type { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import type { BillingPeriod } from '@/db/schema/billingPeriods'
import type { Country } from '@/db/schema/countries'
import type { Customer } from '@/db/schema/customers'
import type { DiscountRedemption } from '@/db/schema/discountRedemptions'
import type { Discount } from '@/db/schema/discounts'
import type { Organization } from '@/db/schema/organizations'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Subscription } from '@/db/schema/subscriptions'
import type { UsageMeter } from '@/db/schema/usageMeters'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import {
  CountryCode,
  CurrencyCode,
  DiscountAmountType,
  DiscountDuration,
  FeeCalculationType,
  PaymentMethodType,
  StripeConnectContractType,
  SubscriptionItemType,
} from '@/types'
import { createSubscriptionFeeCalculationInsert as createSubscriptionFeeCalculationInsertFunction } from '@/utils/bookkeeping/fees/subscription'
import core from '@/utils/core'

describe('createSubscriptionFeeCalculationInsert', () => {
  let orgData: Awaited<ReturnType<typeof setupOrg>>
  let customer: Customer.Record
  let paymentMethodRec: PaymentMethod.Record
  let subscriptionRec: Subscription.Record
  let billingPeriodRec: BillingPeriod.Record
  let organizationCountryRec: Country.Record
  let usageMeterRec: UsageMeter.Record
  let testDiscount: Discount.Record

  beforeEach(async () => {
    orgData = await setupOrg()
    customer = await setupCustomer({
      organizationId: orgData.organization.id,
    })
    paymentMethodRec = await setupPaymentMethod({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      type: PaymentMethodType.Card,
    })
    subscriptionRec = await setupSubscription({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      paymentMethodId: paymentMethodRec.id,
      priceId: orgData.price.id,
    })
    billingPeriodRec = await setupBillingPeriod({
      subscriptionId: subscriptionRec.id,
      startDate: new Date('2023-01-01T00:00:00.000Z').getTime(),
      endDate: new Date('2023-01-31T23:59:59.999Z').getTime(),
    })
    const countries = await adminTransaction(
      async ({ transaction }) =>
        selectCountries(
          {
            id: (orgData.organization as Organization.Record)
              .countryId,
          },
          transaction
        )
    )
    if (!countries || countries.length === 0)
      throw new Error(
        'Organization country not found during test setup'
      )
    organizationCountryRec = countries[0]!

    usageMeterRec = await setupUsageMeter({
      organizationId: orgData.organization.id,
      name: 'Subscription Test Meter',
      pricingModelId: orgData.pricingModel.id,
    })
    testDiscount = await setupDiscount({
      organizationId: orgData.organization.id,
      name: '10% Off Sub',
      amount: 10,
      amountType: DiscountAmountType.Percent,
      code: 'SUB10OFF',
    })
  })

  it('should calculate basic subscription with static items, no discount, domestic payment, Platform contract', async () => {
    const nowTime = Date.now()
    const staticItem: BillingPeriodItem.StaticRecord = {
      id: core.nanoid(),
      billingPeriodId: billingPeriodRec.id,
      name: 'Basic Plan Fee',
      description: 'Monthly fee for basic plan',
      type: SubscriptionItemType.Static,
      unitPrice: 5000,
      quantity: 1,
      discountRedemptionId: null,
      createdAt: nowTime,
      updatedAt: nowTime,
      livemode: true,
      createdByCommit: null,
      updatedByCommit: null,
      position: 0,
    }

    const params = {
      organization: {
        ...(orgData.organization as Organization.Record),
        feePercentage: '2.0',
        stripeConnectContractType: StripeConnectContractType.Platform,
      },
      billingPeriod: billingPeriodRec,
      billingPeriodItems: [staticItem],
      paymentMethod: paymentMethodRec,
      organizationCountry: organizationCountryRec,
      livemode: true,
      currency: CurrencyCode.USD,
      discountRedemption: undefined,
      usageOverages: [],
    }

    const result =
      createSubscriptionFeeCalculationInsertFunction(params)

    expect(result.baseAmount).toBe(5000)
    expect(result.discountAmountFixed).toBe(0)
    expect(result.pretaxTotal).toBe(5000)
    expect(result.flowgladFeePercentage).toBe('2')
    expect(result.internationalFeePercentage).toBe('0')
    expect(result.paymentMethodFeeFixed).toBe(
      Math.round(5000 * 0.029 + 30)
    )
    expect(result.taxAmountFixed).toBe(0)
    expect(result.stripeTaxCalculationId).toBeNull()
    expect(result.type).toBe(FeeCalculationType.SubscriptionPayment)
    expect(result.organizationId).toBe(orgData.organization.id)
    expect(result.billingPeriodId).toBe(billingPeriodRec.id)
    expect(result.currency).toBe(CurrencyCode.USD)
  })

  it('should handle subscription with static/usage items, discount, international payment, MerchantOfRecord contract', async () => {
    const nowTime = Date.now()
    const staticItem: BillingPeriodItem.StaticRecord = {
      id: core.nanoid(),
      billingPeriodId: billingPeriodRec.id,
      name: 'Static Component Euro',
      description: 'Static part of Euro plan',
      type: SubscriptionItemType.Static,
      unitPrice: 3000,
      quantity: 1,
      discountRedemptionId: null,
      createdAt: nowTime,
      updatedAt: nowTime,
      livemode: false,
      createdByCommit: null,
      updatedByCommit: null,
      position: 0,
    }
    const billingPeriodItems = [staticItem]
    const usageOverages = [
      {
        usageMeterId: usageMeterRec.id,
        balance: 100,
        priceId: orgData.price.id,
        usageEventsPerUnit: 1,
        unitPrice: 5,
      },
    ]

    const discountRedemptionRec: DiscountRedemption.Record = {
      id: core.nanoid(),
      discountId: testDiscount.id,
      subscriptionId: subscriptionRec.id,
      discountCode: testDiscount.code,
      discountAmountType: testDiscount.amountType,
      discountAmount: testDiscount.amount,
      createdAt: nowTime,
      updatedAt: nowTime,
      livemode: false,
      createdByCommit: null,
      updatedByCommit: null,
      position: 0,
      duration: DiscountDuration.Forever,
      numberOfPayments: null,
      purchaseId: core.nanoid(),
      discountName: testDiscount.name,
      fullyRedeemed: false,
      pricingModelId: orgData.pricingModel.id,
    }

    let internationalPaymentMethod = await setupPaymentMethod({
      organizationId: orgData.organization.id,
      customerId: customer.id,
      type: PaymentMethodType.Card,
    })
    internationalPaymentMethod = {
      ...internationalPaymentMethod,
      billingDetails: {
        name: 'UK User',
        email: 'uk@example.com',
        address: {
          line1: '1 Test St',
          city: 'London',
          postal_code: 'SW1A 1AA',
          country: CountryCode.GB,
          line2: null,
          state: null,
        },
      },
      paymentMethodData: {
        ...(internationalPaymentMethod.paymentMethodData || {}),
        country: CountryCode.GB,
      },
    }

    const params = {
      organization: {
        ...(orgData.organization as Organization.Record),
        feePercentage: '1.5',
        stripeConnectContractType:
          StripeConnectContractType.MerchantOfRecord,
        livemode: false,
      },
      billingPeriod: { ...billingPeriodRec, livemode: false },
      billingPeriodItems,
      paymentMethod: internationalPaymentMethod,
      organizationCountry: organizationCountryRec,
      livemode: false,
      currency: CurrencyCode.EUR,
      discountRedemption: discountRedemptionRec,
      usageOverages,
    }

    const result =
      createSubscriptionFeeCalculationInsertFunction(params)

    expect(result.baseAmount).toBe(3500)
    expect(result.discountAmountFixed).toBe(350)
    expect(result.pretaxTotal).toBe(3150)
    expect(result.flowgladFeePercentage).toBe('1.5')
    expect(result.internationalFeePercentage).toBe('1.5')
    expect(result.paymentMethodFeeFixed).toBe(
      Math.round(3150 * 0.029 + 30)
    )
    expect(result.taxAmountFixed).toBe(0)
    expect(result.stripeTaxCalculationId).toBeNull()
    expect(result.currency).toBe(CurrencyCode.EUR)
    expect(result.livemode).toBe(false)
  })
})
