/**
 * Redis Utility Mock
 *
 * Mocks @/utils/redis to prevent loading @upstash/redis.
 * Redis utility functions are mocked with no-op implementations.
 * Tests that need specific Redis behavior can override these mocks.
 */
import { mock } from 'bun:test'

const mockDeleteApiKeyVerificationResult =
  mock<(params: { hashText: string }) => Promise<void>>()
mockDeleteApiKeyVerificationResult.mockResolvedValue(undefined)

const mockSetApiKeyVerificationResult =
  mock<(apiKey: string, result: unknown) => Promise<void>>()
mockSetApiKeyVerificationResult.mockResolvedValue(undefined)

const mockGetApiKeyVerificationResult =
  mock<(apiKey: string) => Promise<null>>()
mockGetApiKeyVerificationResult.mockResolvedValue(null)

const mockSetReferralSelection =
  mock<(params: unknown) => Promise<void>>()
mockSetReferralSelection.mockResolvedValue(undefined)

const mockRemoveFromLRU =
  mock<(namespace: string, cacheKey: string) => Promise<void>>()
mockRemoveFromLRU.mockResolvedValue(undefined)

const mockTrackAndEvictLRU =
  mock<(namespace: string, cacheKey: string) => Promise<void>>()
mockTrackAndEvictLRU.mockResolvedValue(undefined)

// Store mocks globally for tests that need to override behavior
declare global {
  // eslint-disable-next-line no-var
  var __mockDeleteApiKeyVerificationResult: typeof mockDeleteApiKeyVerificationResult
  // eslint-disable-next-line no-var
  var __mockSetApiKeyVerificationResult: typeof mockSetApiKeyVerificationResult
  // eslint-disable-next-line no-var
  var __mockGetApiKeyVerificationResult: typeof mockGetApiKeyVerificationResult
}
globalThis.__mockDeleteApiKeyVerificationResult =
  mockDeleteApiKeyVerificationResult
globalThis.__mockSetApiKeyVerificationResult =
  mockSetApiKeyVerificationResult
globalThis.__mockGetApiKeyVerificationResult =
  mockGetApiKeyVerificationResult

// RedisKeyNamespace enum for tests that import it
export const MockRedisKeyNamespace = {
  ApiKeyVerificationResult: 'apiKeyVerificationResult',
  ReferralSelection: 'referralSelection',
  Telemetry: 'telemetry',
  BannerDismissals: 'bannerDismissals',
  StripeOAuthCsrfToken: 'stripeOAuthCsrfToken',
  SubscriptionsByCustomer: 'subscriptionsByCustomer',
  ItemsBySubscription: 'itemsBySubscription',
  FeaturesBySubscriptionItem: 'featuresBySubscriptionItem',
  MeterBalancesBySubscription: 'meterBalancesBySubscription',
  PaymentMethodsByCustomer: 'paymentMethodsByCustomer',
  PurchasesByCustomer: 'purchasesByCustomer',
  InvoicesByCustomer: 'invoicesByCustomer',
  UsageMetersByPricingModel: 'usageMetersByPricingModel',
  CacheDependencyRegistry: 'cacheDeps',
  CacheRecomputeMetadata: 'cacheRecompute',
  PricingModel: 'pricingModel',
  ProductsByPricingModel: 'productsByPricingModel',
  PricesByPricingModel: 'pricesByPricingModel',
  FeaturesByPricingModel: 'featuresByPricingModel',
  ProductFeaturesByPricingModel: 'productFeaturesByPricingModel',
} as const

export const redisMockExports = {
  deleteApiKeyVerificationResult: mockDeleteApiKeyVerificationResult,
  setApiKeyVerificationResult: mockSetApiKeyVerificationResult,
  getApiKeyVerificationResult: mockGetApiKeyVerificationResult,
  setReferralSelection: mockSetReferralSelection,
  removeFromLRU: mockRemoveFromLRU,
  trackAndEvictLRU: mockTrackAndEvictLRU,
  RedisKeyNamespace: MockRedisKeyNamespace,
  // Block direct redis() access
  redis: () => {
    throw new Error(
      '[Test] Direct Redis client access is blocked. Use the mocked functions instead.'
    )
  },
}
