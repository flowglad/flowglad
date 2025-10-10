import { render } from '@testing-library/react'
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
import { CheckoutPageContextValues } from '@/contexts/checkoutPageContext'
import {
  CurrencyCode,
  PriceType,
  DiscountAmountType,
  DiscountDuration,
  FeeCalculationType,
  PaymentMethodType,
  InvoiceStatus,
} from '@/types'
import { dummyProduct } from '@/stubs/productStubs'
import { subscriptionWithTrialDummyPurchase } from '@/stubs/purchaseStubs'
import { subscriptionDummyPrice } from '@/stubs/priceStubs'
import { dummyOrganization } from '@/stubs/organizationStubs'
import { CheckoutFlowType, IntervalUnit } from '@/types'
import core from '@/utils/core'
import { stubbedCheckoutSession } from '@/stubs/checkoutContextStubs'
import CheckoutPageProvider from '@/contexts/checkoutPageContext'
import {
  TotalBillingDetails,
  calculateTotalBillingDetails,
} from './total-billing-details'
import { Price } from '@/db/schema/prices'
import { Discount } from '@/db/schema/discounts'
import { FeeCalculation } from '@/db/schema/feeCalculations'
import { Invoice } from '@/db/schema/invoices'
import { InvoiceLineItem } from '@/db/schema/invoiceLineItems'

const mockCheckoutPageContext = (): CheckoutPageContextValues => {
  return {
    checkoutSession: stubbedCheckoutSession,
    feeCalculation: null,
    flowType: CheckoutFlowType.Subscription,
    subscriptionDetails: {
      trialPeriodDays: 30,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      pricePerBillingCycle: 100,
      currency: CurrencyCode.USD,
      type: PriceType.Subscription,
    },
    editCheckoutSession: async () =>
      Promise.resolve({ checkoutSession: stubbedCheckoutSession }),
    editCheckoutSessionPaymentMethodType: async () =>
      Promise.resolve({ checkoutSession: stubbedCheckoutSession }),
    editCheckoutSessionCustomerEmail: async () =>
      Promise.resolve({ checkoutSession: stubbedCheckoutSession }),
    editCheckoutSessionBillingAddress: async () =>
      Promise.resolve({ checkoutSession: stubbedCheckoutSession }),
    editCheckoutSessionAutomaticallyUpdateSubscriptions: async () =>
      Promise.resolve({ checkoutSession: stubbedCheckoutSession }),
    attemptDiscountCode: async () =>
      Promise.resolve({ isValid: true }),
    clearDiscountCode: async () =>
      Promise.resolve({ checkoutSession: stubbedCheckoutSession }),
    currency: CurrencyCode.USD,
    product: dummyProduct,
    purchase: subscriptionWithTrialDummyPurchase,
    price: subscriptionDummyPrice,
    sellerOrganization: dummyOrganization,
    redirectUrl: 'https://google.com',
    clientSecret: '123',
  }
}

// Mock the calculation functions
vi.mock('@/utils/bookkeeping/fees/common', () => ({
  calculatePriceBaseAmount: vi.fn(),
  calculateInvoiceBaseAmount: vi.fn(),
  calculateDiscountAmount: vi.fn(),
  calculateTotalDueAmount: vi.fn(),
}))

describe('calculateTotalBillingDetails', () => {
  // Test data setup
  const mockPrice: Price.ClientRecord = {
    ...subscriptionDummyPrice,
    type: PriceType.Subscription,
  }

  const mockUsagePrice = {
    id: 'price-usage-1',
    name: 'Usage Price',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    livemode: false,
    type: PriceType.Usage,
    trialPeriodDays: null,
    usageMeterId: 'meter-1',
    usageEventsPerUnit: 1,
    intervalCount: 1,
    intervalUnit: IntervalUnit.Month,
    unitPrice: 100,
    productId: 'product-1',
    isDefault: false,
    active: true,
    currency: CurrencyCode.USD,
    externalId: null,
    createdByCommit: 'test',
    updatedByCommit: 'test',
    position: 0,
    slug: '',
    startsWithCreditTrial: false,
  } as Price.ClientRecord

  const mockDiscount = {
    id: 'discount-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    organizationId: 'org-1',
    name: 'Test Discount',
    code: 'TEST20',
    amountType: DiscountAmountType.Fixed,
    amount: 200,
    duration: DiscountDuration.Once,
    active: true,
    livemode: false,
    createdByCommit: 'test',
    updatedByCommit: 'test',
    position: 0,
  } as Discount.ClientRecord

  const mockFeeCalculation = {
    id: 'fee-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    organizationId: 'org-1',
    checkoutSessionId: null,
    purchaseId: null,
    discountId: null,
    priceId: null,
    paymentMethodType: PaymentMethodType.Card,
    discountAmountFixed: 300,
    paymentMethodFeeFixed: 0,
    baseAmount: 1200,
    flowgladFeePercentage: '0',
    billingAddress: {
      address: {
        country: 'US',
        name: 'Test Customer',
        line1: '123 Test St',
        city: 'Test City',
        state: 'CA',
        postal_code: '12345',
      },
    },
    taxAmountFixed: 90,
    pretaxTotal: 0,
    stripeTaxCalculationId: null,
    stripeTaxTransactionId: null,
    billingPeriodId: null,
    currency: CurrencyCode.USD,
    type: FeeCalculationType.CheckoutSessionPayment,
    internalNotes: null,
    livemode: false,
  } as FeeCalculation.CustomerRecord

  const mockInvoice = {
    id: 'invoice-1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    organizationId: 'org-1',
    customerId: 'customer-1',
    status: InvoiceStatus.Paid,
    livemode: false,
    createdByCommit: 'test',
    updatedByCommit: 'test',
    position: 0,
  } as Invoice.ClientRecord

  const mockInvoiceLineItems = [
    {
      id: 'line-1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      invoiceId: 'invoice-1',
      priceId: 'price-1',
      quantity: 1,
      price: 2000,
      livemode: false,
      description: 'Test line item',
      type: 'static' as const,
    },
  ] as InvoiceLineItem.ClientRecord[]

  describe('guards', () => {
    it('should throw error when neither price nor invoice is provided', () => {
      // Arrange: params with type inconsistent and both price and invoice undefined
      const params = {
        type: 'price' as const,
        price: undefined,
        invoice: undefined,
        purchase: undefined,
        feeCalculation: null,
        discount: null,
      } as any // Type assertion needed for invalid params to test guard

      // Act & Expect: should throw error 'Either price or invoice is required'
      expect(() => calculateTotalBillingDetails(params)).toThrow(
        'Either price or invoice is required'
      )
    })

    it('should throw error when both price and invoice are provided', () => {
      // Arrange: params includes both price and invoice non-null
      const params = {
        type: 'price' as const,
        price: mockPrice,
        invoice: mockInvoice,
        purchase: undefined,
        feeCalculation: null,
        discount: null,
      } as any // Type assertion needed for invalid params to test guard

      // Act & Expect: should throw error 'Only one of price or invoice is permitted. Received both'
      expect(() => calculateTotalBillingDetails(params)).toThrow(
        'Only one of price or invoice is permitted. Received both'
      )
    })
  })

  describe('price flow', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should handle basic no discount, no feeCalculation', async () => {
      // Arrange: type: 'price', price with non-usage type, purchase optional/undefined
      const { calculatePriceBaseAmount, calculateDiscountAmount } =
        await import('@/utils/bookkeeping/fees/common')
      vi.mocked(calculatePriceBaseAmount).mockReturnValue(1000)
      vi.mocked(calculateDiscountAmount).mockReturnValue(0)

      const params = {
        type: 'price' as const,
        price: mockPrice,
        invoice: undefined,
        purchase: undefined,
        feeCalculation: null,
        discount: null,
      }

      // Act: call function
      const result = calculateTotalBillingDetails(params)

      // Expect:
      expect(result.baseAmount).toBe(1000)
      expect(result.subtotalAmount).toBe(1000)
      expect(result.discountAmount).toBe(0)
      expect(result.taxAmount).toBeNull()
      expect(result.totalDueAmount).toBe(1000)
    })

    it('should handle with discount but no feeCalculation', async () => {
      // Arrange: as A3 but with discount such that calculateDiscountAmount returns 200
      const { calculatePriceBaseAmount, calculateDiscountAmount } =
        await import('@/utils/bookkeeping/fees/common')
      vi.mocked(calculatePriceBaseAmount).mockReturnValue(1000)
      vi.mocked(calculateDiscountAmount).mockReturnValue(200)

      const params = {
        type: 'price' as const,
        price: mockPrice,
        invoice: undefined,
        purchase: undefined,
        feeCalculation: null,
        discount: mockDiscount,
      }

      // Act: call function
      const result = calculateTotalBillingDetails(params)

      // Expect:
      expect(result.baseAmount).toBe(1000)
      expect(result.subtotalAmount).toBe(1000)
      expect(result.discountAmount).toBe(200)
      expect(result.taxAmount).toBeNull()
      expect(result.totalDueAmount).toBe(800)
    })

    it('should handle PriceType.Usage forces totalDueAmount 0', async () => {
      // Arrange: price.type = Usage, calculatePriceBaseAmount returns 1500, discount null
      const { calculatePriceBaseAmount, calculateDiscountAmount } =
        await import('@/utils/bookkeeping/fees/common')
      vi.mocked(calculatePriceBaseAmount).mockReturnValue(1500)
      vi.mocked(calculateDiscountAmount).mockReturnValue(0)

      const params = {
        type: 'price' as const,
        price: mockUsagePrice,
        invoice: undefined,
        purchase: undefined,
        feeCalculation: null,
        discount: null,
      }

      // Act: call function
      const result = calculateTotalBillingDetails(params)

      // Expect:
      expect(result.baseAmount).toBe(1500)
      expect(result.subtotalAmount).toBe(1500)
      expect(result.discountAmount).toBe(0)
      expect(result.taxAmount).toBeNull()
      expect(result.totalDueAmount).toBe(0) // explicit override for usage
    })

    it('should handle with feeCalculation overrides', async () => {
      // Arrange: feeCalculation present with specific fields
      const { calculatePriceBaseAmount, calculateTotalDueAmount } =
        await import('@/utils/bookkeeping/fees/common')
      vi.mocked(calculatePriceBaseAmount).mockReturnValue(1000) // ignored for subtotal/total when feeCalculation is present
      vi.mocked(calculateTotalDueAmount).mockReturnValue(990)

      const params = {
        type: 'price' as const,
        price: mockPrice,
        invoice: undefined,
        purchase: undefined,
        feeCalculation: mockFeeCalculation,
        discount: null,
      }

      // Act: call function
      const result = calculateTotalBillingDetails(params)

      // Expect:
      expect(result.baseAmount).toBe(1000) // equals the computed base from price flow
      expect(result.subtotalAmount).toBe(1200) // feeCalculation.baseAmount
      expect(result.discountAmount).toBe(300) // feeCalculation.discountAmountFixed
      expect(result.taxAmount).toBe(90) // feeCalculation.taxAmountFixed
      expect(result.totalDueAmount).toBe(990) // calculateTotalDueAmount(feeCalculation)
    })
  })

  describe('invoice flow', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should handle basic no discount, no feeCalculation', async () => {
      // Arrange: type: 'invoice', invoice provided, invoiceLineItems provided
      const { calculateInvoiceBaseAmount, calculateDiscountAmount } =
        await import('@/utils/bookkeeping/fees/common')
      vi.mocked(calculateInvoiceBaseAmount).mockReturnValue(2000)
      vi.mocked(calculateDiscountAmount).mockReturnValue(0)

      const params = {
        type: 'invoice' as const,
        invoice: mockInvoice,
        invoiceLineItems: mockInvoiceLineItems,
        price: undefined,
        purchase: undefined,
        feeCalculation: null,
        discount: null,
      }

      // Act: call function
      const result = calculateTotalBillingDetails(params)

      // Expect:
      expect(result.baseAmount).toBe(2000)
      expect(result.subtotalAmount).toBe(2000)
      expect(result.discountAmount).toBe(0)
      expect(result.taxAmount).toBeNull()
      expect(result.totalDueAmount).toBe(2000)
    })

    it('should handle with discount, no feeCalculation', async () => {
      // Arrange: as A7 but with discount such that discount becomes 250
      const { calculateInvoiceBaseAmount, calculateDiscountAmount } =
        await import('@/utils/bookkeeping/fees/common')
      vi.mocked(calculateInvoiceBaseAmount).mockReturnValue(2000)
      vi.mocked(calculateDiscountAmount).mockReturnValue(250)

      const params = {
        type: 'invoice' as const,
        invoice: mockInvoice,
        invoiceLineItems: mockInvoiceLineItems,
        price: undefined,
        purchase: undefined,
        feeCalculation: null,
        discount: mockDiscount,
      }

      // Act: call function
      const result = calculateTotalBillingDetails(params)

      // Expect: totalDueAmount = 1750 and other fields updated accordingly
      expect(result.baseAmount).toBe(2000)
      expect(result.subtotalAmount).toBe(2000)
      expect(result.discountAmount).toBe(250)
      expect(result.taxAmount).toBeNull()
      expect(result.totalDueAmount).toBe(1750)
    })

    it('should handle with feeCalculation overrides', async () => {
      // Arrange: feeCalculation present as in A6; calculateTotalDueAmount returns 950
      const { calculateInvoiceBaseAmount, calculateTotalDueAmount } =
        await import('@/utils/bookkeeping/fees/common')
      vi.mocked(calculateInvoiceBaseAmount).mockReturnValue(2000)
      vi.mocked(calculateTotalDueAmount).mockReturnValue(950)

      const params = {
        type: 'invoice' as const,
        invoice: mockInvoice,
        invoiceLineItems: mockInvoiceLineItems,
        price: undefined,
        purchase: undefined,
        feeCalculation: mockFeeCalculation,
        discount: null,
      }

      // Act: call function
      const result = calculateTotalBillingDetails(params)

      // Expect: same override semantics as in price flow
      expect(result.baseAmount).toBe(2000) // base from invoice calculation
      expect(result.subtotalAmount).toBe(1200) // subtotal from feeCalculation
      expect(result.discountAmount).toBe(300) // discount from feeCalculation
      expect(result.taxAmount).toBe(90) // tax from feeCalculation
      expect(result.totalDueAmount).toBe(950) // total from feeCalculation
    })
  })
})

describe('TotalBillingDetails', () => {
  beforeEach(() => {
    vi.mock(
      import('@/contexts/checkoutPageContext'),
      async (importOriginal) => {
        const actual = await importOriginal()
        return {
          ...actual,
          useCheckoutPageContext: () => mockCheckoutPageContext(),
          // your mocked methods
        }
      }
    )
  })
  afterEach(() => {
    vi.clearAllMocks()
  })
  it('should render', () => {
    const { getByText } = render(<TotalBillingDetails />)
    expect(getByText('Subtotal')).toBeInTheDocument()
  })
})
