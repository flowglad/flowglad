/// <reference lib="dom" />

import { beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  CurrencyCode,
  DiscountAmountType,
  DiscountDuration,
  FeeCalculationType,
  IntervalUnit,
  InvoiceStatus,
  PaymentMethodType,
  PriceType,
} from '@db-core/enums'
import type { Discount } from '@db-core/schema/discounts'
import type { FeeCalculation } from '@db-core/schema/feeCalculations'
import type { InvoiceLineItem } from '@db-core/schema/invoiceLineItems'
import type { Invoice } from '@db-core/schema/invoices'
import type { Price } from '@db-core/schema/prices'
import type { Purchase } from '@db-core/schema/purchases'
import { render } from '@testing-library/react'
// Import types and non-mocked exports from the original module
import type { CheckoutPageContextValues } from '@/contexts/checkoutPageContext'
import { subscriptionDetailsFromCheckoutInfoCore } from '@/contexts/checkoutPageContext'
import { stubbedCheckoutSession } from '@/stubs/checkoutContextStubs'
import { dummyOrganization } from '@/stubs/organizationStubs'
import { subscriptionDummyPrice } from '@/stubs/priceStubs'
import { dummyProduct } from '@/stubs/productStubs'
import { subscriptionWithTrialDummyPurchase } from '@/stubs/purchaseStubs'
import { CheckoutFlowType, type Nullish } from '@/types'
import {
  calculateTotalBillingDetails,
  TotalBillingDetails,
} from './total-billing-details'

/**
 * Type for price flow test params.
 */
interface PriceFlowParams {
  type: 'price'
  price: Price.ClientRecord
  invoice: undefined
  purchase?: Purchase.ClientRecord
  feeCalculation?: Nullish<FeeCalculation.CustomerRecord>
  discount?: Nullish<Discount.ClientRecord>
  quantity?: number
}

/**
 * Type for invoice flow test params.
 */
interface InvoiceFlowParams {
  type: 'invoice'
  invoice: Invoice.ClientRecord
  invoiceLineItems: InvoiceLineItem.ClientRecord[]
  price: undefined
  purchase: undefined
  feeCalculation?: Nullish<FeeCalculation.CustomerRecord>
  discount?: Nullish<Discount.ClientRecord>
}

type TotalBillingParams = PriceFlowParams | InvoiceFlowParams

/**
 * Helper to create price flow test params with proper typing.
 * Uses unknown assertion to allow partial mock data while maintaining type safety.
 */
const createPriceParams = (overrides: {
  price: unknown
  purchase?: unknown
  feeCalculation?: Nullish<FeeCalculation.CustomerRecord>
  discount?: Nullish<Discount.ClientRecord>
  quantity?: number
}): TotalBillingParams =>
  ({
    type: 'price',
    invoice: undefined,
    feeCalculation: null,
    discount: null,
    ...overrides,
  }) as unknown as TotalBillingParams

/**
 * Helper to create invoice flow test params with proper typing.
 */
const createInvoiceParams = (overrides: {
  invoice: unknown
  invoiceLineItems: unknown[]
  feeCalculation?: Nullish<FeeCalculation.CustomerRecord>
  discount?: Nullish<Discount.ClientRecord>
}): TotalBillingParams =>
  ({
    type: 'invoice',
    price: undefined,
    purchase: undefined,
    feeCalculation: null,
    discount: null,
    ...overrides,
  }) as unknown as TotalBillingParams

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

const createMockCheckoutContext = (
  overrides: Record<string, unknown>
): CheckoutPageContextValues => {
  return {
    ...baseMockContext,
    flowType: CheckoutFlowType.Subscription,
    purchase: subscriptionWithTrialDummyPurchase,
    price: mockPrice,
    currency: CurrencyCode.USD,
    discount: null,
    feeCalculation: null,
    editCheckoutSessionLoading: false,
    ...overrides,
  } as unknown as CheckoutPageContextValues
}

// Declare global mock state for checkout context
declare global {
  var __mockedCheckoutContext: CheckoutPageContextValues | undefined
}

// Mock the checkout page context - tests control what useCheckoutPageContext returns
// via globalThis.__mockedCheckoutContext
mock.module('@/contexts/checkoutPageContext', () => ({
  useCheckoutPageContext: () => globalThis.__mockedCheckoutContext,
  // Re-export the original function we need for tests
  subscriptionDetailsFromCheckoutInfoCore:
    subscriptionDetailsFromCheckoutInfoCore,
  // Default export for the provider (not used in these tests but needed for module shape)
  default: ({ children }: { children: React.ReactNode }) => children,
}))

// Test data setup - shared across all tests
const mockPrice = {
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
}

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
} as unknown as Discount.ClientRecord

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
} as unknown as FeeCalculation.CustomerRecord

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
}

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
]

describe('calculateTotalBillingDetails', () => {
  it('should throw error when neither price nor invoice is provided', () => {
    // Arrange: params with type inconsistent and both price and invoice undefined
    // Testing error guard requires intentionally invalid params
    const params = {
      type: 'price' as const,
      price: undefined,
      invoice: undefined,
      purchase: undefined,
      feeCalculation: null,
      discount: null,
    } as unknown as TotalBillingParams

    // Act & Expect: should throw error 'Either price or invoice is required'
    expect(() => calculateTotalBillingDetails(params)).toThrow(
      'Either price or invoice is required'
    )
  })

  it('should throw error when both price and invoice are provided', () => {
    // Arrange: params includes both price and invoice non-null
    // Testing error guard requires intentionally invalid params
    const params = {
      type: 'price' as const,
      price: mockPrice,
      invoice: mockInvoice,
      purchase: undefined,
      feeCalculation: null,
      discount: null,
    } as unknown as TotalBillingParams

    // Act & Expect: should throw error 'Only one of price or invoice is permitted. Received both'
    expect(() => calculateTotalBillingDetails(params)).toThrow(
      'Only one of price or invoice is permitted. Received both'
    )
  })
})

describe('price flow', () => {
  it('should handle basic no discount, no feeCalculation', async () => {
    // Arrange: type: 'price', price with non-usage type, purchase optional/undefined
    const params = createPriceParams({ price: mockPrice })

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
    const params = createPriceParams({
      price: mockPrice,
      discount: mockDiscount,
    })

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
    const params = createPriceParams({ price: mockUsagePrice })

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
    const params = createPriceParams({
      price: mockPrice,
      feeCalculation: mockFeeCalculation,
    })

    // Act: call function
    const result = calculateTotalBillingDetails(params)

    // Expect:
    expect(result.baseAmount).toBe(100) // equals the computed base from price flow
    expect(result.subtotalAmount).toBe(1200) // feeCalculation.baseAmount
    expect(result.discountAmount).toBe(300) // feeCalculation.discountAmountFixed
    expect(result.taxAmount).toBe(90) // feeCalculation.taxAmountFixed
    expect(result.totalDueAmount).toBe(990) // calculateTotalDueAmount(feeCalculation)
  })

  it('should multiply base amount by quantity when quantity is greater than 1', async () => {
    // Arrange: price with unitPrice of 100, quantity of 5
    const params = createPriceParams({
      price: mockPrice,
      quantity: 5,
    })

    // Act: call function
    const result = calculateTotalBillingDetails(params)

    // Expect: base amount should be 100 * 5 = 500
    expect(result.baseAmount).toBe(500)
    expect(result.subtotalAmount).toBe(500)
    expect(result.discountAmount).toBe(0)
    expect(result.taxAmount).toBeNull()
    expect(result.totalDueAmount).toBe(500)
  })

  it('should default quantity to 1 when not provided', async () => {
    // Arrange: price without quantity specified
    const params = createPriceParams({ price: mockPrice })

    // Act: call function
    const result = calculateTotalBillingDetails(params)

    // Expect: base amount should be 100 * 1 = 100
    expect(result.baseAmount).toBe(100)
    expect(result.subtotalAmount).toBe(100)
    expect(result.totalDueAmount).toBe(100)
  })

  it('should apply discount to quantity-multiplied base amount', async () => {
    // Arrange: price with unitPrice of 100, quantity of 3, fixed discount of 200
    const params = createPriceParams({
      price: mockPrice,
      discount: mockDiscount, // fixed 200 discount
      quantity: 3,
    })

    // Act: call function
    const result = calculateTotalBillingDetails(params)

    // Expect: base amount should be 100 * 3 = 300, total due = 300 - 200 = 100
    expect(result.baseAmount).toBe(300)
    expect(result.subtotalAmount).toBe(300)
    expect(result.discountAmount).toBe(200)
    expect(result.totalDueAmount).toBe(100)
  })

  it('should not double-count quantity when purchase exists (purchase values already include quantity)', async () => {
    // Arrange: purchase with pricePerBillingCycle of 500 (which already represents 5 * 100 unitPrice)
    // When quantity is also passed, it should NOT multiply again
    const purchaseWithQuantityIncluded = {
      ...subscriptionWithTrialDummyPurchase,
      pricePerBillingCycle: 500, // Already includes quantity (e.g., 5 seats at 100 each)
      firstInvoiceValue: 500,
      quantity: 5,
    }

    const params = createPriceParams({
      price: mockPrice,
      purchase:
        purchaseWithQuantityIncluded as unknown as Purchase.ClientRecord,
      quantity: 5, // Same quantity, but should not be multiplied again
    })

    // Act: call function
    const result = calculateTotalBillingDetails(params)

    // Expect: base amount should be 500 (from purchase.pricePerBillingCycle), NOT 2500
    // calculatePriceBaseAmount returns pricePerBillingCycle when purchase exists,
    // and we should NOT multiply by quantity again
    expect(result.baseAmount).toBe(500)
    expect(result.subtotalAmount).toBe(500)
    expect(result.totalDueAmount).toBe(500)
  })
})

describe('invoice flow', () => {
  it('should handle basic no discount, no feeCalculation', async () => {
    // Arrange: type: 'invoice', invoice provided, invoiceLineItems provided
    const params = createInvoiceParams({
      invoice: mockInvoice,
      invoiceLineItems: mockInvoiceLineItems,
    })

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
    const params = createInvoiceParams({
      invoice: mockInvoice,
      invoiceLineItems: mockInvoiceLineItems,
      discount: mockDiscount,
    })

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
    const params = createInvoiceParams({
      invoice: mockInvoice,
      invoiceLineItems: mockInvoiceLineItems,
      feeCalculation: mockFeeCalculation,
    })

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
  beforeEach(() => {
    // Clear global mock context before each test
    globalThis.__mockedCheckoutContext = undefined
  })

  describe('component rendering', () => {
    it('should hide component entirely for Add Payment Method flow', () => {
      // Arrange: flowType = AddPaymentMethod
      globalThis.__mockedCheckoutContext = {
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
      } as unknown as CheckoutPageContextValues

      // Act: render component
      const { container } = render(<TotalBillingDetails />)

      // Expect: returns null (nothing rendered)
      expect(container.firstChild).toBeNull()
    })

    it('should render price flow with no discount, no tax, no trial, non-usage', async () => {
      // Arrange context: flowType = Subscription, price non-usage, currency = USD
      globalThis.__mockedCheckoutContext = createMockCheckoutContext({
        subscriptionDetails: {
          trialPeriodDays: null,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          pricePerBillingCycle: 1000,
          currency: CurrencyCode.USD,
          type: PriceType.Subscription,
        },
      })

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
      globalThis.__mockedCheckoutContext = createMockCheckoutContext({
        discount: mockDiscount,
        subscriptionDetails: {
          trialPeriodDays: null,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          pricePerBillingCycle: 1000,
          currency: CurrencyCode.USD,
          type: PriceType.Subscription,
        },
      })

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
      globalThis.__mockedCheckoutContext = createMockCheckoutContext({
        feeCalculation: mockFeeCalculation,
        subscriptionDetails: {
          trialPeriodDays: null,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          pricePerBillingCycle: 1000,
          currency: CurrencyCode.USD,
          type: PriceType.Subscription,
        },
      })

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
      // Arrange: flowType = Subscription, subscriptionDetails.trialPeriodDays set (e.g., 14), pricePerBillingCycle = 1500, discountAmount = 200, isEligibleForTrial = true
      globalThis.__mockedCheckoutContext = createMockCheckoutContext({
        discount: mockDiscount,
        isEligibleForTrial: true,
        subscriptionDetails: {
          trialPeriodDays: 14,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          pricePerBillingCycle: 1500,
          currency: CurrencyCode.USD,
          type: PriceType.Subscription,
        },
      })

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

    it('should not show "Total After Trial" when customer is not eligible for trial (even if price has trial)', async () => {
      // Arrange: isEligibleForTrial = false (customer has used trial before), price has trialPeriodDays = 10, pricePerBillingCycle = 1000
      const price = {
        ...mockPrice,
        unitPrice: 1000,
        trialPeriodDays: 10, // Price has trial, but customer is not eligible
      }
      const purchase = {
        ...subscriptionWithTrialDummyPurchase,
        pricePerBillingCycle: 1000,
        firstInvoiceValue: 1000,
      }

      // Build checkoutInfo to test that subscriptionDetailsFromCheckoutInfoCore correctly handles isEligibleForTrial
      const checkoutInfo = {
        flowType: CheckoutFlowType.Subscription,
        purchase,
        price,
        isEligibleForTrial: false, // Customer has used trial before
        checkoutSession: baseMockContext.checkoutSession,
        customer: null,
        sellerOrganization: baseMockContext.sellerOrganization,
        redirectUrl: baseMockContext.redirectUrl,
        cancelUrl: null,
        clientSecret: baseMockContext.clientSecret,
        customerSessionClientSecret: null,
        discount: null,
        readonlyCustomerEmail: null,
        feeCalculation: null,
        product: baseMockContext.product,
      }

      // Derive subscriptionDetails using the actual function - this should set trialPeriodDays to null
      // Use unknown assertion since checkoutInfo has partial mock data
      const subscriptionDetails =
        subscriptionDetailsFromCheckoutInfoCore(
          checkoutInfo as unknown as Parameters<
            typeof subscriptionDetailsFromCheckoutInfoCore
          >[0]
        )

      // Assert: The function correctly sets trialPeriodDays to null when not eligible
      expect(subscriptionDetails?.trialPeriodDays).toBeNull()

      globalThis.__mockedCheckoutContext = createMockCheckoutContext({
        purchase: purchase as unknown as Purchase.ClientRecord,
        price: price as unknown as Price.ClientRecord,
        isEligibleForTrial: false,
        subscriptionDetails,
      })

      // Act: render component
      const { queryByText, getByTestId } = render(
        <TotalBillingDetails />
      )

      // Expect: Component does NOT display "Total After Trial" section
      expect(queryByText('Total After Trial')).not.toBeInTheDocument()
      // Expect: "Total Due Today" shows full amount (not $0.00)
      expect(
        getByTestId('billing-info-total-due-amount')
      ).toHaveTextContent('$10.00') // 1000 cents = $10.00
    })

    it('should render subscription with trial where discount exceeds price per billing cycle (clamped)', async () => {
      // Arrange: as B5 but pricePerBillingCycle = 100, discountAmount = 200
      globalThis.__mockedCheckoutContext = createMockCheckoutContext({
        discount: mockDiscount,
        isEligibleForTrial: true, // Must be eligible to show trial
        subscriptionDetails: {
          trialPeriodDays: 14,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          pricePerBillingCycle: 100,
          currency: CurrencyCode.USD,
          type: PriceType.Subscription,
        },
      })

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
      globalThis.__mockedCheckoutContext = {
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
      } as unknown as CheckoutPageContextValues

      // Act: render component
      const { queryByText } = render(<TotalBillingDetails />)

      // Expect: hideTotalLabels should hide all billing rows
      expect(queryByText('Subtotal')).not.toBeInTheDocument()
      expect(queryByText('Discount')).not.toBeInTheDocument()
      expect(queryByText('Total Due Today')).not.toBeInTheDocument()
    })

    it('should render invoice flow basic rendering', async () => {
      // Arrange: flowType = Invoice, provide invoice and invoiceLineItems
      globalThis.__mockedCheckoutContext = {
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
      } as unknown as CheckoutPageContextValues

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
      globalThis.__mockedCheckoutContext = {
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
      } as unknown as CheckoutPageContextValues

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
      globalThis.__mockedCheckoutContext = {
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
      } as unknown as CheckoutPageContextValues

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
      globalThis.__mockedCheckoutContext = {
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
      } as unknown as CheckoutPageContextValues

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
