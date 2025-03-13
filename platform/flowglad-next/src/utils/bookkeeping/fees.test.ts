import { describe, it, expect } from 'vitest'
import { Variant } from '@/db/schema/variants'
import { Purchase } from '@/db/schema/purchases'
import { Discount } from '@/db/schema/discounts'
import { BillingAddress } from '@/db/schema/customers'
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
} from '@/types'
import {
  calculateVariantBaseAmount,
  calculateDiscountAmount,
  calculateInternationalFeePercentage,
  calculatePaymentMethodFeeAmount,
  calculateTotalFeeAmount,
  calculateTotalDueAmount,
  createPurchaseSessionFeeCalculationInsert,
  finalizeFeeCalculation,
} from '@/utils/bookkeeping/fees'
import { Organization } from '@/db/schema/organizations'
import { Product } from '@/db/schema/products'
import { PurchaseSession } from '@/db/schema/purchaseSessions'
import { Country } from '@/db/schema/countries'
import { subscriptionWithoutTrialDummyPurchase } from '@/stubs/purchaseStubs'
import {
  setupCustomerProfile,
  setupOrg,
  setupPayment,
  setupInvoice,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/databaseMethods'
import { insertFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import { insertPayment } from '@/db/tableMethods/paymentMethods'
import core from '../core'

describe('fees.ts', () => {
  describe('calculateVariantBaseAmount', () => {
    it('returns variant unit price when no purchase exists', () => {
      const variant = { unitPrice: 1000 } as Variant.Record
      expect(
        calculateVariantBaseAmount({ variant, purchase: null })
      ).toBe(1000)
    })

    it('returns firstInvoiceValue for single payment purchases', () => {
      const variant = { unitPrice: 1000 } as Variant.Record
      const purchase = {
        priceType: PriceType.SinglePayment,
        firstInvoiceValue: 800,
      } as Purchase.Record
      expect(calculateVariantBaseAmount({ variant, purchase })).toBe(
        800
      )
    })

    it('returns pricePerBillingCycle for subscription purchases', () => {
      const variant = { unitPrice: 1000 } as Variant.Record
      const purchase = {
        priceType: PriceType.Subscription,
        pricePerBillingCycle: 900,
      } as Purchase.Record
      expect(calculateVariantBaseAmount({ variant, purchase })).toBe(
        900
      )
    })

    it('falls back to unitPrice when purchase is provided but firstInvoiceValue or pricePerBillingCycle is missing', () => {
      const variant = { unitPrice: 1000 } as Variant.Record
      expect(
        calculateVariantBaseAmount({
          variant,
          // @ts-expect-error - we are testing the fallback behavior
          purchase: {
            ...subscriptionWithoutTrialDummyPurchase,
            firstInvoiceValue: null,
            pricePerBillingCycle: null,
          } as Purchase.Record,
        })
      ).toBe(1000)
    })

    it('handles invalid priceType by falling back to unitPrice', () => {
      const variant = { unitPrice: 1000 } as Variant.Record
      const purchase = {
        priceType: 'InvalidType' as PriceType, // Invalid price type
        firstInvoiceValue: 800,
      } as Purchase.Record
      expect(calculateVariantBaseAmount({ variant, purchase })).toBe(
        1000
      )
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
    const usAddress = {
      address: { country: 'US' },
    } as BillingAddress

    const nonUsAddress = {
      address: { country: 'GB' },
    } as BillingAddress

    const organization = {
      countryId: '1',
    } as Organization.Record

    const organizationCountry = {
      code: 'US',
    } as Country.Record

    it('returns 0 for US addresses', () => {
      expect(
        calculateInternationalFeePercentage({
          paymentMethod: PaymentMethodType.Card,
          paymentMethodCountry: usAddress.address
            .country as CountryCode,
          organization,
          organizationCountry,
        })
      ).toBe(0)
    })

    it('returns base fee for non-card international payments', () => {
      expect(
        calculateInternationalFeePercentage({
          paymentMethod: PaymentMethodType.USBankAccount,
          paymentMethodCountry: nonUsAddress.address
            .country as CountryCode,
          organization,
          organizationCountry,
        })
      ).toBe(1)
    })

    it('returns increased fee for international card payments', () => {
      expect(
        calculateInternationalFeePercentage({
          paymentMethod: PaymentMethodType.Card,
          paymentMethodCountry: nonUsAddress.address
            .country as CountryCode,
          organization,
          organizationCountry,
        })
      ).toBe(2.5) // 1 + 1.5
    })

    it('handles null or undefined billingAddress.country', () => {
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
        `Billing address country ${invalidAddress.address.country.toUpperCase()} is not in the list of country codes`
      )
    })

    it('handles case sensitivity in country codes', () => {
      const mixedCaseAddress = {
        address: { country: 'us' }, // Lowercase
      } as BillingAddress

      expect(
        calculateInternationalFeePercentage({
          paymentMethod: PaymentMethodType.Card,
          paymentMethodCountry: mixedCaseAddress.address
            .country as CountryCode,
          organization,
          organizationCountry,
        })
      ).toBe(0)
    })
  })

  describe('calculatePaymentMethodFeeAmount', () => {
    it('calculates card fee correctly', () => {
      expect(
        calculatePaymentMethodFeeAmount(1000, PaymentMethodType.Card)
      ).toBe(59) // (1000 * 0.029 + 30) rounded
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
      ).toBe(8) // (1000 * 0.008) rounded
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

    it('handles invalid paymentMethod by returning 0', () => {
      expect(
        calculatePaymentMethodFeeAmount(
          1000,
          'InvalidMethod' as PaymentMethodType
        )
      ).toBe(0)
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
      }

      // Expected calculation:
      // Discount inclusive amount = 1000 - 100 = 900
      // Flowglad fee = 900 * 0.10 = 90
      // International fee = 900 * 0.025 = 22.5
      // Total = 90 + 22.5 + 59 + 90 = 261.5 rounded to 262
      expect(calculateTotalFeeAmount(feeCalculation)).toBe(262)
    })

    it('handles null or undefined fee percentages', () => {
      const feeCalculation = {
        ...coreFeeCalculation,
        flowgladFeePercentage: 'null',
        internationalFeePercentage: 'null',
      }

      expect(() => calculateTotalFeeAmount(feeCalculation)).toThrow() // Only tax and payment method fees
    })

    it('handles negative discountAmountFixed', () => {
      const feeCalculation = {
        ...coreFeeCalculation,
        discountAmountFixed: -100,
      }

      expect(calculateTotalFeeAmount(feeCalculation)).toBe(249) // 1000 + 100 + 90 + 59 + 100
    })

    it('handles zero or negative baseAmount', () => {
      const feeCalculation = {
        ...coreFeeCalculation,
        baseAmount: 0,
      }

      expect(calculateTotalFeeAmount(feeCalculation)).toBe(149) // Only tax and payment method fees
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
      }

      // 1000 - 100 + 90 = 990
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
      }

      expect(calculateTotalDueAmount(feeCalculation)).toBe(90) // Only tax
    })
  })

  describe('createPurchaseSessionFeeCalculationInsert', () => {
    it('returns taxAmount = 0 and stripeTaxCalculationId null when calculating fee for organization with StripeConnectContractType Platform', async () => {
      const organization = {
        id: 'org_1',
        stripeConnectContractType: StripeConnectContractType.Platform,
      } as Organization.Record

      const product = {
        id: 'prod_1',
      } as Product.Record

      const variant = {
        id: 'var_1',
        unitPrice: 1000,
      } as Variant.Record

      const purchaseSession = {
        id: 'sess_1',
        paymentMethodType: PaymentMethodType.Card,
        billingAddress: {
          address: { country: 'US' },
        } as BillingAddress,
      } as PurchaseSession.FeeReadyRecord

      const organizationCountry = {
        code: 'US',
      } as Country.Record

      const feeCalculationInsert =
        await createPurchaseSessionFeeCalculationInsert({
          organization,
          product,
          variant,
          purchase: undefined,
          discount: undefined,
          PurchaseSessionId: purchaseSession.id,
          billingAddress: purchaseSession.billingAddress,
          paymentMethodType: purchaseSession.paymentMethodType,
          organizationCountry,
        })

      expect(feeCalculationInsert.taxAmountFixed).toBe(0)
      expect(feeCalculationInsert.stripeTaxCalculationId).toBeNull()
    })
  })

  describe('finalizeFeeCalculation', () => {
    const billingAddress: BillingAddress = {
      address: {
        country: 'US',
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
      const { organization, variant } = await setupOrg()

      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: organization.id,
              variantId: variant.id,
              type: FeeCalculationType.PurchaseSessionPayment,
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

      expect(updatedFeeCalculation.flowgladFeePercentage).toBe('0.00')
      expect(updatedFeeCalculation.internalNotes).toContain(
        'Total processed month to date: 0'
      )
    })

    it('sets flowgladFeePercentage to 0 when total resolved payments are under $1000', async () => {
      const stripePaymentIntentId1 = `pi_${core.nanoid()}`
      const stripePaymentIntentId2 = `pi_${core.nanoid()}`
      const stripeChargeId1 = `ch_${core.nanoid()}`
      const stripeChargeId2 = `ch_${core.nanoid()}`
      const { organization, variant } = await setupOrg()
      const customerProfile = await setupCustomerProfile({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        organizationId: organization.id,
        customerProfileId: customerProfile.id,
        variantId: variant.id,
        livemode: true,
      })

      // Create some payments that total over $1000 but only $500 is resolved
      await setupPayment({
        stripeChargeId: stripeChargeId1,
        status: PaymentStatus.Processing,
        amount: 100000, // $1000
        customerProfileId: customerProfile.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
      })

      await setupPayment({
        stripeChargeId: stripeChargeId2,
        status: PaymentStatus.Succeeded,
        amount: 50000, // $500
        customerProfileId: customerProfile.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
      })

      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: organization.id,
              variantId: variant.id,
              type: FeeCalculationType.PurchaseSessionPayment,
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

      expect(updatedFeeCalculation.flowgladFeePercentage).toBe('0.00')
      expect(updatedFeeCalculation.internalNotes).toContain(
        'Total processed month to date: 50000'
      )
    })

    it('keeps original flowgladFeePercentage when resolved payments exceed $1000', async () => {
      const stripePaymentIntentId = `pi_${core.nanoid()}`
      const stripeChargeId = `ch_${core.nanoid()}`
      const { organization, variant } = await setupOrg()
      const customerProfile = await setupCustomerProfile({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        organizationId: organization.id,
        customerProfileId: customerProfile.id,
        variantId: variant.id,
        livemode: true,
      })

      await setupPayment({
        stripeChargeId,
        status: PaymentStatus.Succeeded,
        amount: 150000, // $1500
        customerProfileId: customerProfile.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
      })

      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: organization.id,
              variantId: variant.id,
              type: FeeCalculationType.PurchaseSessionPayment,
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

      expect(updatedFeeCalculation.flowgladFeePercentage).toBe(
        '10.00'
      )
      expect(updatedFeeCalculation.internalNotes).toContain(
        'Total processed month to date: 150000'
      )
    })

    it('does not exclude refunded payments from fee calculation', async () => {
      const stripeChargeId = `ch_${core.nanoid()}`
      const { organization, variant } = await setupOrg()
      const customerProfile = await setupCustomerProfile({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        organizationId: organization.id,
        customerProfileId: customerProfile.id,
        variantId: variant.id,
        livemode: true,
      })

      await setupPayment({
        stripeChargeId,
        status: PaymentStatus.Refunded,
        amount: 150000, // $1500
        customerProfileId: customerProfile.id,
        organizationId: organization.id,
        invoiceId: invoice.id,
      })
      const baseFeePercentage = '10.00'
      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: organization.id,
              variantId: variant.id,
              type: FeeCalculationType.PurchaseSessionPayment,
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
        'Total processed month to date: 150000'
      )
    })

    it('ignores payments from previous months', async () => {
      const stripePaymentIntentId = `pi_${core.nanoid()}`
      const stripeChargeId = `ch_${core.nanoid()}`
      const { organization, variant } = await setupOrg()
      const customerProfile = await setupCustomerProfile({
        organizationId: organization.id,
      })
      const invoice = await setupInvoice({
        organizationId: organization.id,
        customerProfileId: customerProfile.id,
        variantId: variant.id,
        livemode: true,
      })

      // Create a payment from last month
      const lastMonth = new Date()
      lastMonth.setMonth(lastMonth.getMonth() - 1)

      await adminTransaction(async ({ transaction }) => {
        return insertPayment(
          {
            stripeChargeId,
            status: PaymentStatus.Succeeded,
            amount: 150000, // $1500
            customerProfileId: customerProfile.id,
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
            stripePaymentIntentId,
          },
          transaction
        )
      })

      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: organization.id,
              variantId: variant.id,
              type: FeeCalculationType.PurchaseSessionPayment,
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

      expect(updatedFeeCalculation.flowgladFeePercentage).toBe('0.00')
      expect(updatedFeeCalculation.internalNotes).toContain(
        'Total processed month to date: 0'
      )
    })

    it('only considers payments from the same organization', async () => {
      const stripeChargeId1 = `ch_${core.nanoid()}`
      const stripeChargeId2 = `ch_${core.nanoid()}`
      const { organization: org1, variant: variant1 } =
        await setupOrg()
      const { organization: org2 } = await setupOrg()

      const customerProfile1 = await setupCustomerProfile({
        organizationId: org1.id,
      })
      const customerProfile2 = await setupCustomerProfile({
        organizationId: org2.id,
      })

      const invoice1 = await setupInvoice({
        organizationId: org1.id,
        customerProfileId: customerProfile1.id,
        variantId: variant1.id,
        livemode: true,
      })
      const invoice2 = await setupInvoice({
        organizationId: org2.id,
        customerProfileId: customerProfile2.id,
        variantId: variant1.id,
        livemode: true,
      })

      // Create payment for org1
      await setupPayment({
        stripeChargeId: stripeChargeId1,
        status: PaymentStatus.Succeeded,
        amount: 50000, // $500
        customerProfileId: customerProfile1.id,
        organizationId: org1.id,
        invoiceId: invoice1.id,
      })

      // Create payment for org2
      await setupPayment({
        stripeChargeId: stripeChargeId2,
        status: PaymentStatus.Succeeded,
        amount: 150000, // $1500
        customerProfileId: customerProfile2.id,
        organizationId: org2.id,
        invoiceId: invoice2.id,
      })

      const feeCalculation = await adminTransaction(
        async ({ transaction }) => {
          return insertFeeCalculation(
            {
              organizationId: org1.id,
              variantId: variant1.id,
              type: FeeCalculationType.PurchaseSessionPayment,
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

      expect(updatedFeeCalculation.flowgladFeePercentage).toBe('0.00')
      expect(updatedFeeCalculation.internalNotes).toContain(
        'Total processed month to date: 50000'
      )
    })
  })
})
