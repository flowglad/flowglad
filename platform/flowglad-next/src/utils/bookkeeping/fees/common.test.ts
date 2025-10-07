import { describe, it, expect } from 'vitest'
import {
  PriceType,
  PaymentMethodType,
  DiscountAmountType,
  CountryCode,
  CurrencyCode,
  FeeCalculationType,
  StripeConnectContractType,
} from '@/types'
import {
  calculatePriceBaseAmount,
  calculateDiscountAmount,
  calculateInternationalFeePercentage,
  calculatePaymentMethodFeeAmount,
  calculateTotalFeeAmount,
  calculateTotalDueAmount,
  finalizeFeeCalculation,
} from './common'
import { subscriptionWithoutTrialDummyPurchase } from '@/stubs/purchaseStubs'
import {
  setupOrg,
  setupCustomer,
  setupPayment,
  setupInvoice,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { insertFeeCalculation } from '@/db/tableMethods/feeCalculationMethods'
import {
  BillingAddress,
  Organization,
} from '@/db/schema/organizations'
import { PaymentStatus } from '@/types'
import core from '@/utils/core'
import { insertPayment } from '@/db/tableMethods/paymentMethods'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { Discount } from '@/db/schema/discounts'
import { Price } from '@/db/schema/prices'
import { Country } from '@/db/schema/countries'
import { Purchase } from '@/db/schema/purchases'

// Price and Discount Utilities
describe('calculatePriceBaseAmount', () => {
  it('returns price unit price when no purchase exists', () => {
    const price = { unitPrice: 1000 } as Price.Record
    expect(calculatePriceBaseAmount({ price, purchase: null })).toBe(
      1000
    )
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
        purchase: {
          ...subscriptionWithoutTrialDummyPurchase,
          firstInvoiceValue: null,
          pricePerBillingCycle: null,
          // note - testing fallback behavior
        } as unknown as Purchase.SubscriptionPurchaseClientRecord,
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

describe('calculatePriceBaseAmount', () => {
  it('returns price unit price when no purchase exists', () => {
    const price = { unitPrice: 1000 } as any
    expect(calculatePriceBaseAmount({ price, purchase: null })).toBe(
      1000
    )
  })
  it('returns firstInvoiceValue for single payment purchases', () => {
    const price = { unitPrice: 1000 } as any
    const purchase = {
      priceType: PriceType.SinglePayment,
      firstInvoiceValue: 800,
    } as any
    expect(calculatePriceBaseAmount({ price, purchase })).toBe(800)
  })
  it('returns pricePerBillingCycle for subscription purchases', () => {
    const price = { unitPrice: 1000 } as any
    const purchase = {
      priceType: PriceType.Subscription,
      pricePerBillingCycle: 900,
    } as any
    expect(calculatePriceBaseAmount({ price, purchase })).toBe(900)
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
    } as any
    expect(calculateDiscountAmount(1000, discount)).toBe(500)
  })
  it('calculates percentage discount correctly', () => {
    const discount = {
      amountType: DiscountAmountType.Percent,
      amount: 20,
    } as any
    expect(calculateDiscountAmount(1000, discount)).toBe(200)
  })
})

// International Fee

describe('calculateInternationalFeePercentage', () => {
  const org = {
    feePercentage: '1.0',
    stripeConnectContractType: 'Platform',
  } as any
  const orgCountry = { code: CountryCode.US } as any
  it('returns 0 for same-country transactions', () => {
    expect(
      calculateInternationalFeePercentage({
        paymentMethod: PaymentMethodType.Card,
        paymentMethodCountry: CountryCode.US,
        organization: org,
        organizationCountry: orgCountry,
      })
    ).toBe(0)
  })
  it('returns 1.5 for international card transactions', () => {
    expect(
      calculateInternationalFeePercentage({
        paymentMethod: PaymentMethodType.Card,
        paymentMethodCountry: CountryCode.GB,
        organization: org,
        organizationCountry: { code: CountryCode.US } as any,
      })
    ).toBe(1.5)
  })
})

// Payment Method Fee

describe('calculatePaymentMethodFeeAmount', () => {
  it('calculates card fee correctly', () => {
    expect(
      calculatePaymentMethodFeeAmount(1000, PaymentMethodType.Card)
    ).toBe(59)
  })
  it('caps bank account fee', () => {
    expect(
      calculatePaymentMethodFeeAmount(
        100000,
        PaymentMethodType.USBankAccount
      )
    ).toBe(500)
  })
})

// Total Fee and Due

describe('calculateTotalFeeAmount & calculateTotalDueAmount', () => {
  const coreCalc = {
    baseAmount: 1000,
    discountAmountFixed: 100,
    taxAmountFixed: 90,
    flowgladFeePercentage: '10',
    internationalFeePercentage: '2.5',
    paymentMethodFeeFixed: 59,
  } as any
  it('calculates total fee correctly', () => {
    expect(calculateTotalFeeAmount(coreCalc)).toBe(
      Math.round((1000 - 100) * 0.1 + (1000 - 100) * 0.025 + 59 + 90)
    )
  })
  it('calculates total due correctly', () => {
    const dueCalc = {
      baseAmount: 1000,
      discountAmountFixed: 100,
      taxAmountFixed: 90,
    } as any
    expect(calculateTotalDueAmount(dueCalc)).toBe(990)
  })
})

// Finalize Fee Calculation (integration)

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
      'Credits applied: 0. No fee after credits due to monthly free tier. Processed MTD after post-credit amount: 1000. Free tier: 100000.'
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
      'Credits applied: 0. No fee after credits due to monthly free tier. Processed MTD after post-credit amount: 51000. Free tier: 100000.'
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
      'Credits applied: 0. Monthly free tier already exhausted. Full fee applied on post-credit amount 1000. Effective percentage on entire transaction: 0.650000%.'
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
      'Credits applied: 0. No fee after credits due to monthly free tier. Processed MTD after post-credit amount: 51000. Free tier: 100000.'
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
      'Credits applied: 0. Monthly free tier already exhausted. Full fee applied on post-credit amount 1000. Effective percentage on entire transaction: 0.650000%.'
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
      'Credits applied: 0. Partial fee after credits due to monthly free tier overage: 10000. Processed MTD before post-credit amount: 90000. Free tier: 100000. Effective percentage on entire transaction: 2.50000%.'
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
      'Credits applied: 0. Monthly free tier already exhausted. Full fee applied on post-credit amount 1000. Effective percentage on entire transaction: 0.650000%.'
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
          chargeDate: lastMonth.getTime(),
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
      'Credits applied: 0. No fee after credits due to monthly free tier. Processed MTD after post-credit amount: 1000. Free tier: 100000.'
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
      'Credits applied: 0. No fee after credits due to monthly free tier. Processed MTD after post-credit amount: 51000. Free tier: 100000.'
    )
  })
})
