/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CheckoutSessionStatus,
  PriceType,
  SubscriptionStatus,
} from '@/types'
import { checkoutInfoForCheckoutSession } from '@/utils/checkoutHelpers'
import Page from './page'

// Mock next/navigation redirect
const redirect = vi.fn()
vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  redirect: (url: string) => redirect(url),
}))

// Mock checkoutInfo schema parsing to bypass strict Zod requirements in unit tests
vi.mock('@/db/tableMethods/purchaseMethods', () => ({
  checkoutInfoSchema: {
    parse: (x: any) => x,
  },
}))

// Mock server utilities used by the page
vi.mock('@/db/adminTransaction', () => ({
  adminTransaction: (fn: any) => fn({ transaction: {} }),
}))

vi.mock('@/utils/stripe', () => ({
  getPaymentIntent: vi.fn(async (id: string) => ({
    client_secret: `pi_secret_${id}`,
  })),
  getSetupIntent: vi.fn(async (id: string) => ({
    client_secret: `si_secret_${id}`,
  })),
}))

vi.mock('@/utils/checkoutHelpers', () => ({
  checkoutInfoForCheckoutSession: vi.fn(async (id: string) => ({
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
  })),
  getClientSecretsForCheckoutSession: vi.fn(async () => ({
    clientSecret: 'pi_secret_test',
    customerSessionClientSecret: null,
  })),
}))

describe('CheckoutSessionPage', () => {
  beforeEach(() => {
    redirect.mockReset()
  })

  it('renders when only free subscription exists (no block)', async () => {
    const ui = await Page({
      params: Promise.resolve({ id: 'cs_123' }),
    } as any)
    expect(ui).toMatchObject({})
    expect(redirect).not.toHaveBeenCalled()
  })

  it('redirects when session not open and setup intent present', async () => {
    // Adjust mock to return non-open status
    vi.mocked(checkoutInfoForCheckoutSession).mockResolvedValueOnce({
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
    } as any)

    await Page({ params: Promise.resolve({ id: 'cs_456' }) } as any)
    expect(redirect).toHaveBeenCalledWith(
      '/purchase/post-payment?setup_intent=seti_999'
    )
  })

  it('blocks when active paid exists and multiples disallowed, redirect to successUrl if defined', async () => {
    vi.mocked(checkoutInfoForCheckoutSession).mockResolvedValueOnce({
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
    } as any)

    await Page({ params: Promise.resolve({ id: 'cs_789' }) } as any)
    expect(redirect).toHaveBeenCalledWith(
      'https://example.com/success'
    )
  })
})
