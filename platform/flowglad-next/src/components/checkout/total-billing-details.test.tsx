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
import { CurrencyCode } from '@/types'
import { dummyProduct } from '@/stubs/productStubs'
import { subscriptionWithTrialDummyPurchase } from '@/stubs/purchaseStubs'
import { subscriptionDummyPrice } from '@/stubs/priceStubs'
import { dummyOrganization } from '@/stubs/organizationStubs'
import { CheckoutFlowType, IntervalUnit, PriceType } from '@/types'
import core from '@/utils/core'
import { stubbedCheckoutSession } from '@/stubs/checkoutContextStubs'
import CheckoutPageProvider from '@/contexts/checkoutPageContext'
import { TotalBillingDetails } from './total-billing-details'

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
