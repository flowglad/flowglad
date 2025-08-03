import { describe, it, expect, beforeEach } from 'vitest'
import { Price } from '@/db/schema/prices'
import { Purchase } from '@/db/schema/purchases'
import { Discount } from '@/db/schema/discounts'
import {
  BillingAddress,
  Organization,
} from '@/db/schema/organizations'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import {
  PriceType,
  PaymentMethodType,
  DiscountAmountType,
  StripeConnectContractType,
  CountryCode,
  PaymentStatus,
  FeeCalculationType,
  CurrencyCode,
  SubscriptionItemType,
  DiscountDuration,
} from '@/types'
import {
  calculatePriceBaseAmount,
  calculateDiscountAmount,
  calculateInternationalFeePercentage,
  calculatePaymentMethodFeeAmount,
  calculateTotalFeeAmount,
  calculateTotalDueAmount,
  createCheckoutSessionFeeCalculationInsertForPrice,
  finalizeFeeCalculation,
  createSubscriptionFeeCalculationInsert as createSubscriptionFeeCalculationInsertFunction,
} from '@/utils/bookkeeping/fees'
import { Product } from '@/db/schema/products'
import { CheckoutSession } from '@/db/schema/checkoutSessions'
import { Country } from '@/db/schema/countries'
import { subscriptionWithoutTrialDummyPurchase } from '@/stubs/purchaseStubs'
import {
  setupCustomer,
  setupOrg,
  setupPayment,
  setupInvoice,
  setupPaymentMethod,
  setupSubscription,
  setupBillingPeriod,
  setupUsageMeter,
  setupDiscount,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { insertFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { insertPayment } from '@/db/tableMethods/paymentMethods'
import core from '../core'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import { BillingPeriod } from '@/db/schema/billingPeriods'
import { PaymentMethod } from '@/db/schema/paymentMethods'
import { DiscountRedemption } from '@/db/schema/discountRedemptions'
import { Customer } from '@/db/schema/customers'
import { Subscription } from '@/db/schema/subscriptions'
import { UsageMeter } from '@/db/schema/usageMeters'
import { selectCountries } from '@/db/tableMethods/countryMethods'
import * as R from 'ramda'

describe('fees.ts', () => {
  describe('calculatePriceBaseAmount', () => {
    it('returns price unit price when no purchase exists', () => {
      const price = { unitPrice: 1000 } as Price.Record
      expect(
        calculatePriceBaseAmount({ price, purchase: null })
      ).toBe(1000)
    })

    it('returns firstInvoiceValue for single payment purchases', () => {
      const price = { unitPrice: 1000 } as Price.Record
      const purchase = {
        priceType: PriceType.SinglePayment,
        firstInvoiceValue: 800,
      } as Purchase.Record
      expect(calculatePriceBaseAmount({ price, purchase })).toBe(800)
    })

    it('returns pricePerBillingCycle for subscription purchases', () => {
      const price = { unitPrice: 1000 } as Price.Record
      const purchase = {
        priceType: PriceType.Subscription,
        pricePerBillingCycle: 900,
      } as Purchase.Record
      expect(calculatePriceBaseAmount({ price, purchase })).toBe(900)
    })

    it('falls back to unitPrice when purchase is provided but firstInvoiceValue or pricePerBillingCycle is missing', () => {
      const price = { unitPrice: 1000 } as Price.Record
      expect(
        calculatePriceBaseAmount({
          price,
          // @ts-expect-error - we are testing the fallback behavior
          purchase: {
            ...subscriptionWithoutTrialDummyPurchase,
            firstInvoiceValue: null,
            pricePerBillingCycle: null,
          } as Purchase.Record,
        })
      ).toBe(1000)
    })

    it('handles invalid type by falling back to unitPrice', () => {
      const price = { unitPrice: 1000 } as Price.Record
      const purchase = {
        priceType: 'InvalidType' as PriceType, // Invalid price type
        firstInvoiceValue: 800,
      } as Purchase.Record
      expect(calculatePriceBaseAmount({ price, purchase })).toBe(1000)
    })
  })

  describe('calculateDiscountAmount', () => {
    it('returns 0 when no discount exists', () => {
      expect(calculateDiscountAmount(1000, null)).toBe(0)
    })

    it('returns fixed amount for fixed discounts', () => {
      const discount = {
        amountType: DiscountAmountType.Fixed,
        amount: 500,
      } as Discount.Record
      expect(calculateDiscountAmount(1000, discount)).toBe(500)
    })

    it('calculates percentage discount correctly', () => {
      const discount = {
        amountType: DiscountAmountType.Percent,
        amount: 20,
      } as Discount.Record
      expect(calculateDiscountAmount(1000, discount)).toBe(200) // 20% off 1000
    })

    it('caps percentage discount at 100%', () => {
      const discount = {
        amountType: DiscountAmountType.Percent,
        amount: 120,
      } as Discount.Record
      expect(calculateDiscountAmount(1000, discount)).toBe(1000)
    })

    it('handles zero or negative basePrice gracefully', () => {
      const discount = {
        amountType: DiscountAmountType.Percent,
        amount: 20,
      } as Discount.Record
      expect(calculateDiscountAmount(0, discount)).toBe(0)
      expect(calculateDiscountAmount(-100, discount)).toBe(-20) // 20% off -100
    })

    it('handles invalid discount amountType by returning 0', () => {
      const discount = {
        amountType: 'InvalidType' as DiscountAmountType, // Invalid type
        amount: 20,
      } as Discount.Record
      expect(calculateDiscountAmount(1000, discount)).toBe(0)
    })
  })

  describe('calculateInternationalFeePercentage', () => {
    const organization = {
      countryId: '1',
      stripeConnectContractType:
        StripeConnectContractType.MerchantOfRecord,
    } as Organization.Record

    const organizationCountry = {
      code: CountryCode.US,
    } as Country.Record

    it('returns 0 for Merchant Of Record transactions with US billing addresses', () => {
      expect(
        calculateInternationalFeePercentage({
          paymentMethod: PaymentMethodType.Card,
          paymentMethodCountry: CountryCode.US,
          organization: {
            ...organization,
            stripeConnectContractType:
              StripeConnectContractType.MerchantOfRecord,
          },
          organizationCountry,
        })
      ).toBe(0)
    })

    it('returns base fee for non-card international payments when not MoR or non-US', () => {
      expect(
        calculateInternationalFeePercentage({
          paymentMethod: PaymentMethodType.USBankAccount,
          paymentMethodCountry: CountryCode.GB,
          organization: {
            ...organization,
            stripeConnectContractType:
              StripeConnectContractType.Platform,
          },
          organizationCountry: {
            ...organizationCountry,
            code: CountryCode.DE,
          },
        })
      ).toBe(0)
    })

    it('returns increased fee for international card payments when not MoR or non-US', () => {
      expect(
        calculateInternationalFeePercentage({
          paymentMethod: PaymentMethodType.Card,
          paymentMethodCountry: CountryCode.GB,
          organization: {
            ...organization,
            stripeConnectContractType:
              StripeConnectContractType.Platform,
          },
          organizationCountry: {
            ...organizationCountry,
            code: CountryCode.DE,
          },
        })
      ).toBe(1.5)
    })

    it('handles invalid paymentMethodCountry by throwing an error', () => {
      const invalidAddress = {
        address: { country: 'XX' },
      } as BillingAddress

      expect(() =>
        calculateInternationalFeePercentage({
          paymentMethod: PaymentMethodType.Card,
          paymentMethodCountry: invalidAddress.address
            .country as CountryCode,
          organization,
          organizationCountry,
        })
      ).toThrow(
        `Billing address country XX is not in the list of country codes`
      )
    })

    it('handles case sensitivity by relying on CountryCode enum (implicitly handles toUpperCase in func)', () => {
      expect(
        calculateInternationalFeePercentage({
          paymentMethod: PaymentMethodType.Card,
          paymentMethodCountry: CountryCode.US,
          organization: {
            ...organization,
            stripeConnectContractType:
              StripeConnectContractType.MerchantOfRecord,
          },
          organizationCountry: {
            ...organizationCountry,
            code: CountryCode.US,
          },
        })
      ).toBe(0)
    })
  })

  describe('calculatePaymentMethodFeeAmount', () => {
    it('calculates card fee correctly', () => {
      expect(
        calculatePaymentMethodFeeAmount(1000, PaymentMethodType.Card)
      ).toBe(59)
    })

    it('caps US bank account fee at 500', () => {
      expect(
        calculatePaymentMethodFeeAmount(
          100000,
          PaymentMethodType.USBankAccount
        )
      ).toBe(500)
    })

    it('calculates small US bank account fee correctly', () => {
      expect(
        calculatePaymentMethodFeeAmount(
          1000,
          PaymentMethodType.USBankAccount
        )
      ).toBe(8)
    })

    it('caps ACH fee at $5 for payments over $625', () => {
      expect(
        calculatePaymentMethodFeeAmount(
          62600,
          PaymentMethodType.USBankAccount
        )
      ).toBe(500)
    })

    it('calculates ACH fee at 0.8% for payments under $625', () => {
      expect(
        calculatePaymentMethodFeeAmount(
          62400,
          PaymentMethodType.USBankAccount
        )
      ).toBe(499)
    })

    it('caps SEPA debit fee at 600', () => {
      expect(
        calculatePaymentMethodFeeAmount(
          100000,
          PaymentMethodType.SEPADebit
        )
      ).toBe(600)
    })

    it('handles zero or negative totalAmountToCharge', () => {
      expect(
        calculatePaymentMethodFeeAmount(0, PaymentMethodType.Card)
      ).toBe(0)
      expect(
        calculatePaymentMethodFeeAmount(-100, PaymentMethodType.Card)
      ).toBe(0)
    })

    it('returns 2.9% + 30 cents for card payment method', () => {
      expect(
        calculatePaymentMethodFeeAmount(1000, PaymentMethodType.Card)
      ).toBe(59)
    })
  })

  describe('calculateTotalFeeAmount', () => {
    const coreFeeCalculation = {
      baseAmount: 1000,
      discountAmountFixed: 0,
      taxAmountFixed: 90,
      flowgladFeePercentage: '10',
      internationalFeePercentage: '0',
      paymentMethodFeeFixed: 59,
    } as FeeCalculation.Record

    it('calculates total fee with all components', () => {
      const feeCalculation = {
        ...coreFeeCalculation,
        discountAmountFixed: 100,
        internationalFeePercentage: '2.5',
      } as FeeCalculation.Record
      expect(calculateTotalFeeAmount(feeCalculation)).toBe(262)
    })

    it('handles null or undefined fee percentages by throwing error for parseFloat', () => {
      const feeCalculation = {
        ...coreFeeCalculation,
        flowgladFeePercentage: null as any, // Cast to any to allow null for testing runtime behavior
        internationalFeePercentage: null as any, // Cast to any to allow null for testing runtime behavior
      } as FeeCalculation.Record

      expect(() => calculateTotalFeeAmount(feeCalculation)).toThrow()
    })

    it('handles negative discountAmountFixed by treating it as 0 reduction', () => {
      const feeCalculation = {
        ...coreFeeCalculation,
        discountAmountFixed: -100,
      } as FeeCalculation.Record
      expect(calculateTotalFeeAmount(feeCalculation)).toBe(249)
    })

    it('handles zero or negative baseAmount', () => {
      const feeCalculation = {
        ...coreFeeCalculation,
        baseAmount: 0,
      } as FeeCalculation.Record
      expect(calculateTotalFeeAmount(feeCalculation)).toBe(149)
    })
  })

  describe('calculateTotalDueAmount', () => {
    const coreFeeCalculation = {
      baseAmount: 1000,
      discountAmountFixed: 0,
      taxAmountFixed: 90,
    } as FeeCalculation.CustomerRecord

    it('calculates total due with all components', () => {
      const feeCalculation = {
        ...coreFeeCalculation,
        discountAmountFixed: 100,
      } as FeeCalculation.CustomerRecord
      expect(calculateTotalDueAmount(feeCalculation)).toBe(990)
    })

    it('returns 0 when calculation would be negative', () => {
      const feeCalculation = {
        baseAmount: 100,
        discountAmountFixed: 200,
        taxAmountFixed: 90,
      } as FeeCalculation.CustomerRecord

      expect(calculateTotalDueAmount(feeCalculation)).toBe(0)
    })

    it('handles zero or negative baseAmount', () => {
      const feeCalculation = {
        ...coreFeeCalculation,
        baseAmount: 0,
      } as FeeCalculation.CustomerRecord

      expect(calculateTotalDueAmount(feeCalculation)).toBe(90)
    })
  })

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
        })

      expect(feeCalculationInsert.taxAmountFixed).toBe(0)
      expect(feeCalculationInsert.stripeTaxCalculationId).toBeNull()
    })
  })

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
        startDate: new Date('2023-01-01T00:00:00.000Z'),
        endDate: new Date('2023-01-31T23:59:59.999Z'),
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
        catalogId: orgData.catalog.id,
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
      const staticItem: BillingPeriodItem.StaticRecord = {
        id: core.nanoid(),
        billingPeriodId: billingPeriodRec.id,
        name: 'Basic Plan Fee',
        description: 'Monthly fee for basic plan',
        type: SubscriptionItemType.Static,
        unitPrice: 5000,
        quantity: 1,
        discountRedemptionId: null,
        usageMeterId: null,
        usageEventsPerUnit: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        livemode: true,
        createdByCommit: null,
        updatedByCommit: null,
        position: 0,
      }

      const params = {
        organization: {
          ...(orgData.organization as Organization.Record),
          feePercentage: '2.0',
          stripeConnectContractType:
            StripeConnectContractType.Platform,
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
      const staticItem: BillingPeriodItem.StaticRecord = {
        id: core.nanoid(),
        billingPeriodId: billingPeriodRec.id,
        name: 'Static Component Euro',
        description: 'Static part of Euro plan',
        type: SubscriptionItemType.Static,
        unitPrice: 3000,
        quantity: 1,
        discountRedemptionId: null,
        usageMeterId: null,
        usageEventsPerUnit: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        livemode: false,
        createdByCommit: null,
        updatedByCommit: null,
        position: 0,
      }
      const usageItem: BillingPeriodItem.UsageRecord = {
        id: core.nanoid(),
        billingPeriodId: billingPeriodRec.id,
        name: 'Usage Component Euro',
        description: 'Usage part of Euro plan',
        type: SubscriptionItemType.Usage,
        unitPrice: 5,
        quantity: 1,
        discountRedemptionId: null,
        usageMeterId: usageMeterRec.id,
        usageEventsPerUnit: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        livemode: false,
        createdByCommit: null,
        updatedByCommit: null,
        position: 0,
      }
      const billingPeriodItems = [staticItem, usageItem]
      const usageOverages = [
        { usageMeterId: usageMeterRec.id, balance: 100 },
      ]

      const discountRedemptionRec: DiscountRedemption.Record = {
        id: core.nanoid(),
        discountId: testDiscount.id,
        subscriptionId: subscriptionRec.id,
        discountCode: testDiscount.code,
        discountAmountType: testDiscount.amountType,
        discountAmount: testDiscount.amount,
        createdAt: new Date(),
        updatedAt: new Date(),
        livemode: false,
        createdByCommit: null,
        updatedByCommit: null,
        position: 0,
        duration: DiscountDuration.Forever,
        numberOfPayments: null,
        purchaseId: core.nanoid(),
        discountName: testDiscount.name,
        fullyRedeemed: false,
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
})
