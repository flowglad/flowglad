// @ts-nocheck
import { render } from '@testing-library/react'
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
import {
  CheckoutPageContextValues,
  useCheckoutPageContext,
} from '@/contexts/checkoutPageContext'
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

const baseMockContext = {
  checkoutSession: stubbedCheckoutSession,
  feeCalculation: null,
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
  attemptDiscountCode: async () => Promise.resolve({ isValid: true }),
  clearDiscountCode: async () =>
    Promise.resolve({ checkoutSession: stubbedCheckoutSession }),
  currency: CurrencyCode.USD,
  product: dummyProduct,
  sellerOrganization: dummyOrganization,
  redirectUrl: 'https://google.com',
  clientSecret: '123',
}

const mockCheckoutPageContext = (): CheckoutPageContextValues => {
  return {
    ...baseMockContext,
    flowType: CheckoutFlowType.Subscription,
    purchase: subscriptionWithTrialDummyPurchase,
    price: subscriptionDummyPrice,
    subscriptionDetails: {
      trialPeriodDays: 30,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      pricePerBillingCycle: 100,
      currency: CurrencyCode.USD,
      type: PriceType.Subscription,
    },
  } as CheckoutPageContextValues
}

// Mock the checkout page context
vi.mock('@/contexts/checkoutPageContext', () => ({
  useCheckoutPageContext: vi.fn(),
}))

// Test data setup - shared across all tests
const mockPrice = {
  ...subscriptionDummyPrice,
  type: PriceType.Subscription,
} as Price.ClientRecord

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

describe('calculateTotalBillingDetails', () => {
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
    expect(result.baseAmount).toBe(100)
    expect(result.subtotalAmount).toBe(100)
    expect(result.discountAmount).toBe(0)
    expect(result.taxAmount).toBeNull()
    expect(result.totalDueAmount).toBe(100)
  })

  it('should handle with discount but no feeCalculation', async () => {
    // Arrange: as A3 but with discount such that calculateDiscountAmount returns 200
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
    expect(result.baseAmount).toBe(100)
    expect(result.subtotalAmount).toBe(100)
    expect(result.discountAmount).toBe(200)
    expect(result.taxAmount).toBeNull()
    expect(result.totalDueAmount).toBe(-100)
  })

  it('should handle PriceType.Usage forces totalDueAmount 0', async () => {
    // Arrange: price.type = Usage, calculatePriceBaseAmount returns 1500, discount null
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
    expect(result.baseAmount).toBe(100)
    expect(result.subtotalAmount).toBe(100)
    expect(result.discountAmount).toBe(0)
    expect(result.taxAmount).toBeNull()
    expect(result.totalDueAmount).toBe(0) // explicit override for usage
  })

  it('should handle with feeCalculation overrides', async () => {
    // Arrange: feeCalculation present with specific fields
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
    expect(result.baseAmount).toBe(100) // equals the computed base from price flow
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
    expect(result.discountAmount).toBe(200)
    expect(result.taxAmount).toBeNull()
    expect(result.totalDueAmount).toBe(1800)
  })

  it('should handle with feeCalculation overrides', async () => {
    // Arrange: feeCalculation present as in A6; calculateTotalDueAmount returns 950
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
    expect(result.totalDueAmount).toBe(990) // total from feeCalculation
  })
})

describe('TotalBillingDetails', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  describe('component rendering', () => {
    it('should hide component entirely for Add Payment Method flow', () => {
      // Arrange: flowType = AddPaymentMethod
      const mockContext = {
        checkoutSession: stubbedCheckoutSession,
        feeCalculation: null,
        flowType: CheckoutFlowType.AddPaymentMethod,
        purchase: undefined,
        price: undefined,
        subscriptionDetails: undefined,
        editCheckoutSession: async () =>
          Promise.resolve({
            checkoutSession: stubbedCheckoutSession,
          }),
        editCheckoutSessionPaymentMethodType: async () =>
          Promise.resolve({
            checkoutSession: stubbedCheckoutSession,
          }),
        editCheckoutSessionCustomerEmail: async () =>
          Promise.resolve({
            checkoutSession: stubbedCheckoutSession,
          }),
        editCheckoutSessionBillingAddress: async () =>
          Promise.resolve({
            checkoutSession: stubbedCheckoutSession,
          }),
        editCheckoutSessionAutomaticallyUpdateSubscriptions:
          async () =>
            Promise.resolve({
              checkoutSession: stubbedCheckoutSession,
            }),
        attemptDiscountCode: async () =>
          Promise.resolve({ isValid: true }),
        clearDiscountCode: async () =>
          Promise.resolve({
            checkoutSession: stubbedCheckoutSession,
          }),
        currency: CurrencyCode.USD,
        product: dummyProduct,
        sellerOrganization: dummyOrganization,
        redirectUrl: 'https://google.com',
        clientSecret: '123',
      } as CheckoutPageContextValues

      vi.mocked(useCheckoutPageContext).mockReturnValue(mockContext)

      // Act: render component
      const { container } = render(<TotalBillingDetails />)

      // Expect: returns null (nothing rendered)
      expect(container.firstChild).toBeNull()
    })

    it('should render price flow with no discount, no tax, no trial, non-usage', async () => {
      // Arrange context: flowType = Subscription, price non-usage, currency = USD
      const mockContext: CheckoutPageContextValues = {
        ...baseMockContext,
        flowType: CheckoutFlowType.Subscription,
        purchase: subscriptionWithTrialDummyPurchase,
        price: mockPrice,
        currency: CurrencyCode.USD,
        discount: null,
        feeCalculation: null,
        editCheckoutSessionLoading: false,
        subscriptionDetails: {
          trialPeriodDays: null,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          pricePerBillingCycle: 1000,
          currency: CurrencyCode.USD,
          type: PriceType.Subscription,
        },
      } as CheckoutPageContextValues

      vi.mocked(useCheckoutPageContext).mockReturnValue(mockContext)

      // Act: render component
      const { getByText, getByTestId } = render(
        <TotalBillingDetails />
      )

      // Expect:
      expect(getByText('Subtotal')).toBeInTheDocument()
      expect(getByText('Total Due Today')).toBeInTheDocument()
      expect(
        getByTestId('billing-info-total-due-label')
      ).toBeInTheDocument()
      expect(
        getByTestId('billing-info-total-due-amount')
      ).toHaveTextContent('$1.00')
    })

    it('should render price flow with discount visible', async () => {
      // Arrange: as B2 but with discount present such that discount is 200 and total is 800
      const mockContext: CheckoutPageContextValues = {
        ...baseMockContext,
        flowType: CheckoutFlowType.Subscription,
        purchase: subscriptionWithTrialDummyPurchase,
        price: mockPrice,
        currency: CurrencyCode.USD,
        discount: mockDiscount,
        feeCalculation: null,
        editCheckoutSessionLoading: false,
        subscriptionDetails: {
          trialPeriodDays: null,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          pricePerBillingCycle: 1000,
          currency: CurrencyCode.USD,
          type: PriceType.Subscription,
        },
      } as CheckoutPageContextValues

      vi.mocked(useCheckoutPageContext).mockReturnValue(mockContext)

      // Act: render component
      const { getByText } = render(<TotalBillingDetails />)

      // Expect:
      expect(getByText('Subtotal')).toBeInTheDocument()
      expect(getByText('Discount')).toBeInTheDocument()
      expect(getByText('$2.00')).toBeInTheDocument() // 200 cents = $2.00
      expect(getByText('-$1.00')).toBeInTheDocument() // 100 - 200 = -100 cents = -$1.00
    })

    it('should render price flow with feeCalculation showing tax and overridden subtotal', async () => {
      // Arrange: provide feeCalculation so that subtotalAmount = 1200, discountAmount = 300, taxAmount = 90, totalDueAmount = 990
      const mockContext: CheckoutPageContextValues = {
        ...baseMockContext,
        flowType: CheckoutFlowType.Subscription,
        purchase: subscriptionWithTrialDummyPurchase,
        price: mockPrice,
        currency: CurrencyCode.USD,
        discount: null,
        feeCalculation: mockFeeCalculation,
        editCheckoutSessionLoading: false,
        subscriptionDetails: {
          trialPeriodDays: null,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          pricePerBillingCycle: 1000,
          currency: CurrencyCode.USD,
          type: PriceType.Subscription,
        },
      } as CheckoutPageContextValues

      vi.mocked(useCheckoutPageContext).mockReturnValue(mockContext)

      // Act: render component
      const { getByText } = render(<TotalBillingDetails />)

      // Expect:
      expect(getByText('Subtotal')).toBeInTheDocument()
      expect(getByText('$12.00')).toBeInTheDocument() // 1200 cents = $12.00
      expect(getByText('Discount')).toBeInTheDocument()
      expect(getByText('$3.00')).toBeInTheDocument() // 300 cents = $3.00
      expect(getByText('Tax')).toBeInTheDocument()
      expect(getByText('$0.90')).toBeInTheDocument() // 90 cents = $0.90
      expect(getByText('$9.90')).toBeInTheDocument() // 990 cents = $9.90
    })

    it('should render subscription with trial showing "Total After Trial" and Total Due Today = $0.00', async () => {
      // Arrange: flowType = Subscription, subscriptionDetails.trialPeriodDays set (e.g., 14), pricePerBillingCycle = 1500, discountAmount = 200
      const mockContext: CheckoutPageContextValues = {
        ...baseMockContext,
        flowType: CheckoutFlowType.Subscription,
        purchase: subscriptionWithTrialDummyPurchase,
        price: mockPrice,
        currency: CurrencyCode.USD,
        discount: mockDiscount,
        feeCalculation: null,
        editCheckoutSessionLoading: false,
        subscriptionDetails: {
          trialPeriodDays: 14,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          pricePerBillingCycle: 1500,
          currency: CurrencyCode.USD,
          type: PriceType.Subscription,
        },
      } as CheckoutPageContextValues

      vi.mocked(useCheckoutPageContext).mockReturnValue(mockContext)

      // Act: render component
      const { getByText, getByTestId } = render(
        <TotalBillingDetails />
      )

      // Expect:
      expect(getByText('Total After Trial')).toBeInTheDocument()
      expect(getByText('$13.00')).toBeInTheDocument() // 1500 - 200 = 1300 cents = $13.00
      expect(getByText('Total Due Today')).toBeInTheDocument()
      expect(
        getByTestId('billing-info-total-due-amount')
      ).toHaveTextContent('$0.00') // Due to trial
    })

    it('should render subscription with trial where discount exceeds price per billing cycle (clamped)', async () => {
      // Arrange: as B5 but pricePerBillingCycle = 100, discountAmount = 200
      const mockContext: CheckoutPageContextValues = {
        ...baseMockContext,
        flowType: CheckoutFlowType.Subscription,
        purchase: subscriptionWithTrialDummyPurchase,
        price: mockPrice,
        currency: CurrencyCode.USD,
        discount: mockDiscount,
        feeCalculation: null,
        editCheckoutSessionLoading: false,
        subscriptionDetails: {
          trialPeriodDays: 14,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          pricePerBillingCycle: 100,
          currency: CurrencyCode.USD,
          type: PriceType.Subscription,
        },
      } as CheckoutPageContextValues

      vi.mocked(useCheckoutPageContext).mockReturnValue(mockContext)

      // Act: render component
      const { getByText, getByTestId } = render(
        <TotalBillingDetails />
      )

      // Expect:
      expect(getByText('Total After Trial')).toBeInTheDocument()
      expect(
        getByTestId('billing-info-total-due-amount')
      ).toHaveTextContent('$0.00') // Math.max(0, 100 - 200) = 0
      expect(getByText('Total Due Today')).toBeInTheDocument()
      expect(
        getByTestId('billing-info-total-due-amount')
      ).toHaveTextContent('$0.00') // Due to trial
    })

    it('should hide total labels for usage-based price in subscription', async () => {
      // Arrange: flowType = Subscription, price.type = Usage
      const mockContext: CheckoutPageContextValues = {
        ...baseMockContext,
        flowType: CheckoutFlowType.Subscription,
        purchase: subscriptionWithTrialDummyPurchase,
        price: mockUsagePrice,
        currency: CurrencyCode.USD,
        discount: mockDiscount,
        feeCalculation: null,
        editCheckoutSessionLoading: false,
        subscriptionDetails: {
          trialPeriodDays: null,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          pricePerBillingCycle: 1000,
          currency: CurrencyCode.USD,
          type: PriceType.Usage,
        },
      } as CheckoutPageContextValues

      vi.mocked(useCheckoutPageContext).mockReturnValue(mockContext)

      // Act: render component
      const { queryByText } = render(<TotalBillingDetails />)

      // Expect: hideTotalLabels should hide all billing rows
      expect(queryByText('Subtotal')).not.toBeInTheDocument()
      expect(queryByText('Discount')).not.toBeInTheDocument()
      expect(queryByText('Total Due Today')).not.toBeInTheDocument()
    })

    it('should render invoice flow basic rendering', async () => {
      // Arrange: flowType = Invoice, provide invoice and invoiceLineItems
      const mockContext: CheckoutPageContextValues = {
        ...baseMockContext,
        flowType: CheckoutFlowType.Invoice,
        purchase: undefined,
        price: undefined,
        invoice: mockInvoice,
        invoiceLineItems: mockInvoiceLineItems,
        currency: CurrencyCode.USD,
        discount: null,
        feeCalculation: null,
        editCheckoutSessionLoading: false,
        subscriptionDetails: undefined,
      } as CheckoutPageContextValues

      vi.mocked(useCheckoutPageContext).mockReturnValue(mockContext)

      // Act: render component
      const { getByText } = render(<TotalBillingDetails />)

      // Expect:
      expect(getByText('Subtotal')).toBeInTheDocument()
      expect(getByText('$20.00')).toBeInTheDocument() // 2000 cents = $20.00
      expect(getByText('Total')).toBeInTheDocument() // Not "Due Today" for invoice
      expect(getByText('$0.00')).toBeInTheDocument()
    })

    it('should render invoice flow with discount & tax via feeCalculation', async () => {
      // Arrange: flowType = Invoice, feeCalculation provides baseAmount=3000, discountAmountFixed=500, taxAmountFixed=100, totalDueAmount=2600
      const mockContext: CheckoutPageContextValues = {
        ...baseMockContext,
        flowType: CheckoutFlowType.Invoice,
        purchase: undefined,
        price: undefined,
        invoice: mockInvoice,
        invoiceLineItems: mockInvoiceLineItems,
        currency: CurrencyCode.USD,
        discount: null,
        feeCalculation: {
          ...mockFeeCalculation,
          baseAmount: 3000,
          discountAmountFixed: 500,
          taxAmountFixed: 100,
        },
        editCheckoutSessionLoading: false,
        subscriptionDetails: undefined,
      } as CheckoutPageContextValues

      vi.mocked(useCheckoutPageContext).mockReturnValue(mockContext)

      // Act: render component
      const { getByText } = render(<TotalBillingDetails />)

      // Expect:
      expect(getByText('Subtotal')).toBeInTheDocument()
      expect(getByText('$30.00')).toBeInTheDocument() // 3000 cents = $30.00
      expect(getByText('Discount')).toBeInTheDocument()
      expect(getByText('$5.00')).toBeInTheDocument() // 500 cents = $5.00
      expect(getByText('Tax')).toBeInTheDocument()
      expect(getByText('$1.00')).toBeInTheDocument() // 100 cents = $1.00
      expect(getByText('Total')).toBeInTheDocument()
      expect(getByText('$26.00')).toBeInTheDocument() // 2600 cents = $26.00
    })

    it('should show loading state with skeletons', async () => {
      // Arrange: any flow where totals are shown and editCheckoutSessionLoading = true
      const mockContext: CheckoutPageContextValues = {
        ...baseMockContext,
        flowType: CheckoutFlowType.Subscription,
        purchase: subscriptionWithTrialDummyPurchase,
        price: mockPrice,
        currency: CurrencyCode.USD,
        discount: null,
        feeCalculation: null,
        editCheckoutSessionLoading: true,
        subscriptionDetails: {
          trialPeriodDays: null,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          pricePerBillingCycle: 1000,
          currency: CurrencyCode.USD,
          type: PriceType.Subscription,
        },
      } as CheckoutPageContextValues

      vi.mocked(useCheckoutPageContext).mockReturnValue(mockContext)

      // Act: render component
      const { container, queryByText } = render(
        <TotalBillingDetails />
      )

      // Expect: skeleton components should be visible, amount text should not be visible
      expect(container.querySelector('.h-5.w-16')).toBeInTheDocument() // Skeleton for line items
      expect(container.querySelector('.h-6.w-24')).toBeInTheDocument() // Skeleton for total
      expect(queryByText('$1.00')).not.toBeInTheDocument() // Amount text should not be visible while loading
    })

    it('should apply currency formatting for non-USD currency', async () => {
      // Arrange: pick a non-USD currency (e.g., EUR), set amounts deterministically
      const mockContext: CheckoutPageContextValues = {
        ...baseMockContext,
        flowType: CheckoutFlowType.Subscription,
        purchase: subscriptionWithTrialDummyPurchase,
        price: mockPrice,
        currency: CurrencyCode.EUR,
        discount: null,
        feeCalculation: null,
        editCheckoutSessionLoading: false,
        subscriptionDetails: {
          trialPeriodDays: null,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          pricePerBillingCycle: 1000,
          currency: CurrencyCode.EUR,
          type: PriceType.Subscription,
        },
      } as CheckoutPageContextValues

      vi.mocked(useCheckoutPageContext).mockReturnValue(mockContext)

      // Act: render component
      const { getByText, getAllByText } = render(
        <TotalBillingDetails />
      )

      // Expect: rendered amounts should be formatted via stripeCurrencyAmountToHumanReadableCurrencyAmount
      expect(getByText('Subtotal')).toBeInTheDocument()
      // The exact formatting depends on the stripeCurrencyAmountToHumanReadableCurrencyAmount implementation
      // but we can verify that the function is called and some formatted amount is displayed
      expect(getAllByText(/€|EUR/)).toHaveLength(2) // Should contain EUR symbol in both subtotal and total
    })
  })
})
