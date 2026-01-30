import { beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  CheckoutSessionStatus,
  PriceType,
  SubscriptionStatus,
} from '@db-core/enums'

// Mock next/navigation redirect
const redirect = mock()
mock.module('next/navigation', () => ({
  notFound: mock(),
  redirect: (url: string) => redirect(url),
}))

// Mock checkoutInfo schema parsing to bypass strict Zod requirements in unit tests
mock.module('@/db/tableMethods/purchaseMethods', () => ({
  checkoutInfoSchema: {
    parse: (x: unknown) => x,
  },
}))

// Mock server utilities used by the page
mock.module('@/db/adminTransaction', () => ({
  adminTransaction: (
    fn: (args: { transaction: object }) => unknown
  ) => fn({ transaction: {} }),
}))

mock.module('@/utils/stripe', () => ({
  getPaymentIntent: mock(async (id: string) => ({
    client_secret: `pi_secret_${id}`,
  })),
  getSetupIntent: mock(async (id: string) => ({
    client_secret: `si_secret_${id}`,
  })),
}))

const mockCheckoutInfoForCheckoutSession = mock(
  async (id: string) => ({
    checkoutSession: {
      id,
      status: 'open',
      stripePaymentIntentId: null,
      stripeSetupIntentId: 'seti_123',
      successUrl: null,
    },
    product: { id: 'prod_1' },
    price: { id: 'price_1', type: 'subscription' },
    sellerOrganization: {
      id: 'org_1',
      allowMultipleSubscriptionsPerCustomer: false,
    },
    feeCalculation: null,
    maybeCustomer: { id: 'cust_1', email: 'a@b.com' },
    maybeCurrentSubscriptions: [
      { status: 'active', isFreePlan: true },
    ],
    discount: null,
  })
)

mock.module('@/utils/checkoutHelpers', () => ({
  checkoutInfoForCheckoutSession: mockCheckoutInfoForCheckoutSession,
  getClientSecretsForCheckoutSession: mock(async () => ({
    clientSecret: 'pi_secret_test',
    customerSessionClientSecret: null,
  })),
}))

// Import component AFTER mock.module calls
import Page from './page'

describe('CheckoutSessionPage', () => {
  beforeEach(() => {
    redirect.mockReset()
  })

  it('renders when only free subscription exists (no block)', async () => {
    const ui = await Page({
      params: Promise.resolve({ id: 'cs_123' }),
    } as Parameters<typeof Page>[0])
    expect(ui).toMatchObject({})
    expect(redirect).not.toHaveBeenCalled()
  })

  it('redirects when session not open and setup intent present', async () => {
    // Adjust mock to return non-open status
    mockCheckoutInfoForCheckoutSession.mockResolvedValueOnce({
      checkoutSession: {
        id: 'cs_456',
        status: CheckoutSessionStatus.Succeeded,
        stripePaymentIntentId: null,
        stripeSetupIntentId: 'seti_999',
        successUrl: null,
      },
      product: { id: 'prod_1' },
      price: { id: 'price_1', type: PriceType.Subscription },
      sellerOrganization: {
        id: 'org_1',
        allowMultipleSubscriptionsPerCustomer: false,
      },
      feeCalculation: null,
      maybeCustomer: { id: 'cust_1', email: 'a@b.com' },
      maybeCurrentSubscriptions: [],
      discount: null,
    } as ReturnType<
      typeof mockCheckoutInfoForCheckoutSession
    > extends Promise<infer R>
      ? R
      : never)

    await Page({
      params: Promise.resolve({ id: 'cs_456' }),
    } as Parameters<typeof Page>[0])
    expect(redirect).toHaveBeenCalledWith(
      '/purchase/post-payment?setup_intent=seti_999'
    )
  })

  it('blocks when active paid exists and multiples disallowed, redirect to successUrl if defined', async () => {
    mockCheckoutInfoForCheckoutSession.mockResolvedValueOnce({
      checkoutSession: {
        id: 'cs_789',
        status: CheckoutSessionStatus.Open,
        stripePaymentIntentId: null,
        stripeSetupIntentId: 'seti_111',
        successUrl: 'https://example.com/success',
      },
      product: { id: 'prod_1' },
      price: { id: 'price_1', type: PriceType.Subscription },
      sellerOrganization: {
        id: 'org_1',
        allowMultipleSubscriptionsPerCustomer: false,
      },
      feeCalculation: null,
      maybeCustomer: { id: 'cust_1', email: 'a@b.com' },
      maybeCurrentSubscriptions: [
        { status: SubscriptionStatus.Active, isFreePlan: false },
      ],
      discount: null,
    } as ReturnType<
      typeof mockCheckoutInfoForCheckoutSession
    > extends Promise<infer R>
      ? R
      : never)

    await Page({
      params: Promise.resolve({ id: 'cs_789' }),
    } as Parameters<typeof Page>[0])
    expect(redirect).toHaveBeenCalledWith(
      'https://example.com/success'
    )
  })
})
