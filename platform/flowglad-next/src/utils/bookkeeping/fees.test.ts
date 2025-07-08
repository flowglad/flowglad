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
  BillingPeriodStatus,
  SubscriptionStatus,
  IntervalUnit,
  DiscountDuration,
} from '@/types'
import {
  calculatePriceBaseAmount,
  calculateDiscountAmount,
  calculateInternationalFeePercentage,
  calculatePaymentMethodFeeAmount,
  calculateTotalFeeAmount,
  calculateTotalDueAmount,
  createCheckoutSessionFeeCalculationInsert,
  finalizeFeeCalculation,
  calculateBillingItemBaseAmount,
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

  describe('createCheckoutSessionFeeCalculationInsert', () => {
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
        await createCheckoutSessionFeeCalculationInsert({
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

  describe('finalizeFeeCalculation', () => {
    const billingAddress: BillingAddress = {
      address: {
        country: CountryCode.US,
        line1: '123 Main St',
        line2: null,
        city: 'Anytown',
        state: 'CA',
        postal_code: '12345',
      },
      name: 'John Doe',
      firstName: 'John',
      lastName: 'Doe',
      phone: '1234567890',
    }

    it('sets flowgladFeePercentage to 0 when no payments exist in current month', async () => {
      const { organization, price } = await setupOrg()

      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: organization.id,
              priceId: price.id,
              type: FeeCalculationType.CheckoutSessionPayment,
              flowgladFeePercentage: '10.00',
              baseAmount: 1000,
              discountAmountFixed: 0,
              taxAmountFixed: 0,
              internationalFeePercentage: '0',
              paymentMethodFeeFixed: 59,
              livemode: true,
              currency: CurrencyCode.USD,
              billingAddress,
              billingPeriodId: null,
              paymentMethodType: PaymentMethodType.Card,
              pretaxTotal: 1000,
            },
            transaction
          )
        }
      )

      const updatedFeeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return finalizeFeeCalculation(feeCalculation, transaction)
        }
      )

      expect(updatedFeeCalculation.flowgladFeePercentage).toBe('0')
      expect(updatedFeeCalculation.internalNotes).toContain(
        'No fee applied. Processed this month after transaction: 1000. Free tier: 100000.'
      )
    })

    it('sets flowgladFeePercentage to 0 when total resolved payments are under the organization free tier', async () => {
      const stripePaymentIntentId1 = `pi_${core.nanoid()}`
      const stripePaymentIntentId2 = `pi_${core.nanoid()}`
      const stripeChargeId1 = `ch_${core.nanoid()}`
      const stripeChargeId2 = `ch_${core.nanoid()}`
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        livemode: true,
      })

      await setupPayment({
        stripeChargeId: stripeChargeId1,
        status: PaymentStatus.Processing,
        amount: 100000,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
      })

      await setupPayment({
        stripeChargeId: stripeChargeId2,
        status: PaymentStatus.Succeeded,
        amount: 50000,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
      })

      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: organization.id,
              priceId: price.id,
              type: FeeCalculationType.CheckoutSessionPayment,
              flowgladFeePercentage: '10.00',
              baseAmount: 1000,
              discountAmountFixed: 0,
              taxAmountFixed: 0,
              internationalFeePercentage: '0',
              paymentMethodFeeFixed: 59,
              billingPeriodId: null,
              currency: CurrencyCode.USD,
              billingAddress,
              livemode: true,
              paymentMethodType: PaymentMethodType.Card,
              pretaxTotal: 1000,
            },
            transaction
          )
        }
      )

      const updatedFeeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return finalizeFeeCalculation(feeCalculation, transaction)
        }
      )

      expect(updatedFeeCalculation.flowgladFeePercentage).toBe('0')
      expect(updatedFeeCalculation.internalNotes).toContain(
        'No fee applied. Processed this month after transaction: 51000. Free tier: 100000.'
      )
    })

    it('keeps original flowgladFeePercentage when resolved payments exceed the organization free tier', async () => {
      const stripePaymentIntentId = `pi_${core.nanoid()}`
      const stripeChargeId = `ch_${core.nanoid()}`
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        livemode: true,
      })

      await setupPayment({
        stripeChargeId,
        status: PaymentStatus.Succeeded,
        amount: 150000,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
      })

      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: organization.id,
              priceId: price.id,
              type: FeeCalculationType.CheckoutSessionPayment,
              flowgladFeePercentage: organization.feePercentage,
              baseAmount: 1000,
              discountAmountFixed: 0,
              taxAmountFixed: 0,
              internationalFeePercentage: '0',
              paymentMethodFeeFixed: 59,
              livemode: true,
              currency: CurrencyCode.USD,
              billingAddress,
              billingPeriodId: null,
              paymentMethodType: PaymentMethodType.Card,
              pretaxTotal: 1000,
            },
            transaction
          )
        }
      )

      const updatedFeeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return finalizeFeeCalculation(feeCalculation, transaction)
        }
      )

      expect(updatedFeeCalculation.flowgladFeePercentage).toBe(
        organization.feePercentage
      )
      expect(updatedFeeCalculation.internalNotes).toContain(
        'Full fee applied. Processed this month before transaction: 150000. Free tier: 100000.'
      )
    })

    it('sets flowgladFeePercentage to 0 when total resolved payments are under the free tier', async () => {
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        livemode: true,
      })

      // Create some payments that total over $1000 but only $500 is resolved
      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Processing,
        amount: 100000, // $1000
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
      })

      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 50000, // $500
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
      })

      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: organization.id,
              priceId: price.id,
              type: FeeCalculationType.CheckoutSessionPayment,
              flowgladFeePercentage: '10.00',
              baseAmount: 1000,
              discountAmountFixed: 0,
              taxAmountFixed: 0,
              internationalFeePercentage: '0',
              paymentMethodFeeFixed: 59,
              billingPeriodId: null,
              currency: CurrencyCode.USD,
              billingAddress,
              livemode: true,
              paymentMethodType: PaymentMethodType.Card,
              pretaxTotal: 1000,
            },
            transaction
          )
        }
      )

      const updatedFeeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return finalizeFeeCalculation(feeCalculation, transaction)
        }
      )

      expect(updatedFeeCalculation.flowgladFeePercentage).toBe('0')
      expect(updatedFeeCalculation.internalNotes).toContain(
        'No fee applied. Processed this month after transaction: 51000. Free tier: 100000.'
      )
    })

    it('applies full org fee when resolved payments exceed the free tier', async () => {
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        livemode: true,
      })

      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 150000, // $1500
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
      })

      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: organization.id,
              priceId: price.id,
              type: FeeCalculationType.CheckoutSessionPayment,
              flowgladFeePercentage: '10.00', // This should be ignored
              baseAmount: 1000,
              discountAmountFixed: 0,
              taxAmountFixed: 0,
              internationalFeePercentage: '0',
              paymentMethodFeeFixed: 59,
              livemode: true,
              currency: CurrencyCode.USD,
              billingAddress,
              billingPeriodId: null,
              paymentMethodType: PaymentMethodType.Card,
              pretaxTotal: 1000,
            },
            transaction
          )
        }
      )

      const updatedFeeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return finalizeFeeCalculation(feeCalculation, transaction)
        }
      )

      expect(updatedFeeCalculation.flowgladFeePercentage).toBe(
        organization.feePercentage
      )
      expect(updatedFeeCalculation.internalNotes).toContain(
        `Full fee applied. Processed this month before transaction: 150000. Free tier: 100000.`
      )
    })

    it('calculates partial fee when transaction crosses the free tier', async () => {
      const { organization, price } = await setupOrg({
        feePercentage: '5.0',
      })
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        livemode: true,
      })

      await setupPayment({
        stripeChargeId: `ch_${core.nanoid()}`,
        status: PaymentStatus.Succeeded,
        amount: 90000, // $900
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
      })

      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: organization.id,
              priceId: price.id,
              type: FeeCalculationType.CheckoutSessionPayment,
              flowgladFeePercentage: '10.00',
              baseAmount: 20000,
              discountAmountFixed: 0,
              taxAmountFixed: 0,
              internationalFeePercentage: '0',
              paymentMethodFeeFixed: 59,
              livemode: true,
              currency: CurrencyCode.USD,
              billingAddress,
              billingPeriodId: null,
              paymentMethodType: PaymentMethodType.Card,
              pretaxTotal: 20000, // $200
            },
            transaction
          )
        }
      )

      const updatedFeeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return finalizeFeeCalculation(feeCalculation, transaction)
        }
      )

      // Overage: (90000 + 20000) - 100000 = 10000
      // Fee on overage: 10000 * 5% = 500
      // Effective percentage: (500 / 20000) * 100 = 2.5%
      expect(updatedFeeCalculation.flowgladFeePercentage).toBe('2.5')
      expect(updatedFeeCalculation.internalNotes).toContain(
        `Partial fee applied. Overage: 10000. Processed this month before transaction: 90000. Free tier: 100000. Effective percentage: 2.50000%.`
      )
    })

    it('does not exclude refunded payments from fee calculation', async () => {
      const stripeChargeId = `ch_${core.nanoid()}`
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        livemode: true,
      })

      await setupPayment({
        stripeChargeId,
        status: PaymentStatus.Refunded,
        amount: 150000,
        customerId: customer.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
      })
      const baseFeePercentage = organization.feePercentage
      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: organization.id,
              priceId: price.id,
              type: FeeCalculationType.CheckoutSessionPayment,
              flowgladFeePercentage: baseFeePercentage,
              baseAmount: 1000,
              discountAmountFixed: 0,
              taxAmountFixed: 0,
              internationalFeePercentage: '0',
              paymentMethodFeeFixed: 59,
              livemode: true,
              currency: CurrencyCode.USD,
              billingAddress,
              billingPeriodId: null,
              paymentMethodType: PaymentMethodType.Card,
              pretaxTotal: 1000,
            },
            transaction
          )
        }
      )

      const updatedFeeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return finalizeFeeCalculation(feeCalculation, transaction)
        }
      )

      expect(updatedFeeCalculation.flowgladFeePercentage).toBe(
        baseFeePercentage
      )
      expect(updatedFeeCalculation.internalNotes).toContain(
        `Full fee applied. Processed this month before transaction: 150000. Free tier: 100000.`
      )
    })

    it('ignores payments from previous months', async () => {
      const stripeChargeId = `ch_${core.nanoid()}`
      const { organization, price } = await setupOrg()
      const customer = await setupCustomer({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        organizationId: organization.id,
        customerId: customer.id,
        priceId: price.id,
        livemode: true,
      })

      const lastMonth = new Date()
      lastMonth.setMonth(lastMonth.getMonth() - 2)

      await adminTransaction(async ({ transaction }) => {
        return insertPayment(
          {
            stripeChargeId,
            status: PaymentStatus.Succeeded,
            amount: 150000,
            customerId: customer.id,
            organizationId: organization.id,
            invoiceId: invoice.id,
            chargeDate: lastMonth,
            currency: CurrencyCode.USD,
            paymentMethod: PaymentMethodType.Card,
            refunded: false,
            refundedAt: null,
            refundedAmount: 0,
            taxCountry: CountryCode.US,
            livemode: true,
            stripePaymentIntentId: `pi_${core.nanoid()}`,
          },
          transaction
        )
      })

      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: organization.id,
              priceId: price.id,
              type: FeeCalculationType.CheckoutSessionPayment,
              flowgladFeePercentage: '10.00',
              baseAmount: 1000,
              discountAmountFixed: 0,
              taxAmountFixed: 0,
              internationalFeePercentage: '0',
              paymentMethodFeeFixed: 59,
              livemode: true,
              currency: CurrencyCode.USD,
              billingAddress,
              billingPeriodId: null,
              paymentMethodType: PaymentMethodType.Card,
              pretaxTotal: 1000,
            },
            transaction
          )
        }
      )

      const updatedFeeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return finalizeFeeCalculation(feeCalculation, transaction)
        }
      )

      expect(updatedFeeCalculation.flowgladFeePercentage).toBe('0')
      expect(updatedFeeCalculation.internalNotes).toContain(
        'No fee applied. Processed this month after transaction: 1000. Free tier: 100000.'
      )
    })

    it('only considers payments from the same organization', async () => {
      const stripeChargeId1 = `ch_${core.nanoid()}`
      const stripeChargeId2 = `ch_${core.nanoid()}`
      const { organization: org1, price: price1 } = await setupOrg()
      const { organization: org2 } = await setupOrg()

      const customer1 = await setupCustomer({
        organizationId: org1.id,
      })
      const customer2 = await setupCustomer({
        organizationId: org2.id,
      })

      const invoice1 = await setupInvoice({
        organizationId: org1.id,
        customerId: customer1.id,
        priceId: price1.id,
        livemode: true,
      })
      const invoice2 = await setupInvoice({
        organizationId: org2.id,
        customerId: customer2.id,
        priceId: price1.id,
        livemode: true,
      })

      await setupPayment({
        stripeChargeId: stripeChargeId1,
        status: PaymentStatus.Succeeded,
        amount: 50000,
        customerId: customer1.id,
        organizationId: org1.id,
        invoiceId: invoice1.id,
      })

      await setupPayment({
        stripeChargeId: stripeChargeId2,
        status: PaymentStatus.Succeeded,
        amount: 150000,
        customerId: customer2.id,
        organizationId: org2.id,
        invoiceId: invoice2.id,
      })

      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: org1.id,
              priceId: price1.id,
              type: FeeCalculationType.CheckoutSessionPayment,
              flowgladFeePercentage: '10.00',
              baseAmount: 1000,
              discountAmountFixed: 0,
              taxAmountFixed: 0,
              internationalFeePercentage: '0',
              paymentMethodFeeFixed: 59,
              livemode: true,
              currency: CurrencyCode.USD,
              billingAddress,
              billingPeriodId: null,
              paymentMethodType: PaymentMethodType.Card,
              pretaxTotal: 1000,
            },
            transaction
          )
        }
      )

      const updatedFeeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return finalizeFeeCalculation(feeCalculation, transaction)
        }
      )

      expect(updatedFeeCalculation.flowgladFeePercentage).toBe('0')
      expect(updatedFeeCalculation.internalNotes).toContain(
        'No fee applied. Processed this month after transaction: 51000. Free tier: 100000.'
      )
    })
  })

  describe('calculateBillingItemBaseAmount', () => {
    let orgData: Awaited<ReturnType<typeof setupOrg>>
    let customer: Customer.Record
    let paymentMethodRec: PaymentMethod.Record
    let subscriptionRec: Subscription.Record
    let billingPeriodRec: BillingPeriod.Record
    let usageMeter1: UsageMeter.Record
    let usageMeter2: UsageMeter.Record

    beforeEach(async () => {
      orgData = await setupOrg()
      customer = await setupCustomer({
        organizationId: orgData.organization.id,
      })
      paymentMethodRec = await setupPaymentMethod({
        organizationId: orgData.organization.id,
        customerId: customer.id,
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
      usageMeter1 = await setupUsageMeter({
        organizationId: orgData.organization.id,
        name: 'Meter 1',
        catalogId: orgData.catalog.id,
      })
      usageMeter2 = await setupUsageMeter({
        organizationId: orgData.organization.id,
        name: 'Meter 2',
        catalogId: orgData.catalog.id,
      })
    })

    it('should return 0 when no billing period items and no usage overages', async () => {
      const billingPeriodItems: BillingPeriodItem.Record[] = []
      const usageOverages: {
        usageMeterId: string
        balance: number
      }[] = []
      expect(
        calculateBillingItemBaseAmount(
          billingPeriodItems,
          usageOverages
        )
      ).toBe(0)
    })

    it('should return sum of static items when only static items exist and no usage overages', async () => {
      const billingPeriodItems: BillingPeriodItem.Record[] = [
        {
          id: core.nanoid(),
          billingPeriodId: billingPeriodRec.id,
          name: 'Static Item 1',
          description: 'First static test item',
          type: SubscriptionItemType.Static,
          unitPrice: 1000,
          quantity: 2,
          discountRedemptionId: null,
          usageMeterId: null,
          usageEventsPerUnit: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          livemode: true,
          createdByCommit: null,
          updatedByCommit: null,
          position: 0,
          externalId: null,
        } as BillingPeriodItem.StaticRecord,
        {
          id: core.nanoid(),
          billingPeriodId: billingPeriodRec.id,
          name: 'Static Item 2',
          description: 'Second static test item',
          type: SubscriptionItemType.Static,
          unitPrice: 500,
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
          externalId: null,
        } as BillingPeriodItem.StaticRecord,
      ]
      const usageOverages: {
        usageMeterId: string
        balance: number
      }[] = []
      expect(
        calculateBillingItemBaseAmount(
          billingPeriodItems,
          usageOverages
        )
      ).toBe(2500)
    })

    it('should return sum of usage overage costs when only usage items and overages exist', async () => {
      const billingPeriodItems: BillingPeriodItem.Record[] = [
        {
          id: core.nanoid(),
          billingPeriodId: billingPeriodRec.id,
          name: 'Usage Item 1',
          description: 'First usage test item',
          type: SubscriptionItemType.Usage,
          unitPrice: 10,
          quantity: 1,
          discountRedemptionId: null,
          usageMeterId: usageMeter1.id,
          usageEventsPerUnit: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          livemode: true,
          createdByCommit: null,
          updatedByCommit: null,
          position: 0,
          externalId: null,
        } as BillingPeriodItem.UsageRecord,
        {
          id: core.nanoid(),
          billingPeriodId: billingPeriodRec.id,
          name: 'Usage Item 2',
          description: 'Second usage test item',
          type: SubscriptionItemType.Usage,
          unitPrice: 5,
          quantity: 1,
          discountRedemptionId: null,
          usageMeterId: usageMeter2.id,
          usageEventsPerUnit: 100,
          createdAt: new Date(),
          updatedAt: new Date(),
          livemode: true,
          createdByCommit: null,
          updatedByCommit: null,
          position: 0,
          externalId: null,
        } as BillingPeriodItem.UsageRecord,
      ]
      const usageOverages = [
        { usageMeterId: usageMeter1.id, balance: 50 },
        { usageMeterId: usageMeter2.id, balance: 2000 },
      ]
      expect(
        calculateBillingItemBaseAmount(
          billingPeriodItems,
          usageOverages
        )
      ).toBe(600)
    })

    it('should return sum of static and usage costs for a mix of items and overages', async () => {
      const billingPeriodItems: BillingPeriodItem.Record[] = [
        {
          id: core.nanoid(),
          billingPeriodId: billingPeriodRec.id,
          name: 'Mixed Static Item',
          description: 'Mixed static test item',
          type: SubscriptionItemType.Static,
          unitPrice: 1000,
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
          externalId: null,
        } as BillingPeriodItem.StaticRecord,
        {
          id: core.nanoid(),
          billingPeriodId: billingPeriodRec.id,
          name: 'Mixed Usage Item',
          description: 'Mixed usage test item',
          type: SubscriptionItemType.Usage,
          unitPrice: 20,
          quantity: 1,
          discountRedemptionId: null,
          usageMeterId: usageMeter1.id,
          usageEventsPerUnit: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          livemode: true,
          createdByCommit: null,
          updatedByCommit: null,
          position: 0,
          externalId: null,
        } as BillingPeriodItem.UsageRecord,
      ]
      const usageOverages = [
        { usageMeterId: usageMeter1.id, balance: 5 },
      ]
      expect(
        calculateBillingItemBaseAmount(
          billingPeriodItems,
          usageOverages
        )
      ).toBe(1100)
    })

    it('should throw an error if usage overage exists for a non-existent usage meter ID', async () => {
      const billingPeriodItems: BillingPeriodItem.Record[] = [
        {
          id: core.nanoid(),
          billingPeriodId: billingPeriodRec.id,
          name: 'Product A Usage',
          description: 'Usage item for Meter A',
          type: SubscriptionItemType.Usage,
          unitPrice: 10,
          quantity: 1,
          discountRedemptionId: null,
          usageMeterId: usageMeter1.id,
          usageEventsPerUnit: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          livemode: true,
          createdByCommit: null,
          updatedByCommit: null,
          position: 0,
          externalId: null,
        } as BillingPeriodItem.UsageRecord,
      ]
      const usageOverages = [
        { usageMeterId: 'meter_B_non_existent', balance: 50 },
      ]
      expect(() =>
        calculateBillingItemBaseAmount(
          billingPeriodItems,
          usageOverages
        )
      ).toThrow(
        'Usage billing period item not found for usage meter id: meter_B_non_existent'
      )
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
