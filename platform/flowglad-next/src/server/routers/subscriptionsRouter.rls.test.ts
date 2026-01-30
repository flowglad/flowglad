import { beforeEach, describe, expect, it } from 'bun:test'
import {
  BillingPeriodStatus,
  CurrencyCode,
  IntervalUnit,
  PriceType,
  SubscriptionStatus,
} from '@db-core/enums'
import type { BillingPeriod } from '@db-core/schema/billingPeriods'
import type { Customer } from '@db-core/schema/customers'
import type { Organization } from '@db-core/schema/organizations'
import type { Price } from '@db-core/schema/prices'
import type { Product } from '@db-core/schema/products'
import type { Subscription } from '@db-core/schema/subscriptions'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import {
  setupBillingPeriod,
  setupCustomer,
  setupOrg,
  setupPrice,
  setupSubscription,
  setupUsageMeter,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { adminTransactionWithResult } from '@/db/adminTransaction'
import type { TRPCApiContext } from '@/server/trpcContext'
import {
  subscriptionsRouter,
  validateAndResolveCustomerForSubscription,
  validateAndResolvePriceForSubscription,
} from './subscriptionsRouter'

const createCaller = (
  organization: Organization.Record,
  apiKeyToken: string,
  livemode: boolean = true
) => {
  return subscriptionsRouter.createCaller({
    organizationId: organization.id,
    organization,
    apiKey: apiKeyToken,
    livemode,
    environment: livemode ? ('live' as const) : ('test' as const),
    isApi: true,
    path: '',
    user: null,
    session: null,
  } as TRPCApiContext)
}

describe('subscriptionsRouter', () => {
  let organization: Organization.Record
  let customer: Customer.Record
  let apiKeyToken: string
  let doNotChargeSubscription: Subscription.Record
  let billingPeriod: BillingPeriod.Record

  beforeEach(async () => {
    // Setup organization with API key
    const orgSetup = await setupOrg()
    organization = orgSetup.organization

    const userApiKeySetup = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    if (!userApiKeySetup.apiKey.token) {
      throw new Error('API key token not found after setup')
    }
    apiKeyToken = userApiKeySetup.apiKey.token

    // Setup customer
    customer = await setupCustomer({
      organizationId: organization.id,
      email: `customer+${Date.now()}@test.com`,
    })

    // Setup subscription with doNotCharge: true
    doNotChargeSubscription = await setupSubscription({
      organizationId: organization.id,
      customerId: customer.id,
      priceId: orgSetup.price.id,
      status: SubscriptionStatus.Active,
      livemode: true,
      doNotCharge: true,
      currentBillingPeriodStart:
        Date.now() - 15 * 24 * 60 * 60 * 1000, // 15 days ago
      currentBillingPeriodEnd: Date.now() + 15 * 24 * 60 * 60 * 1000, // 15 days from now
    })

    // Setup billing period in Active status (valid for retry)
    billingPeriod = await setupBillingPeriod({
      subscriptionId: doNotChargeSubscription.id,
      startDate: doNotChargeSubscription.currentBillingPeriodStart!,
      endDate: doNotChargeSubscription.currentBillingPeriodEnd!,
      livemode: true,
      status: BillingPeriodStatus.Active,
    })
  })

  describe('retryBillingRunProcedure', () => {
    it('should throw BAD_REQUEST when attempting to retry billing for a doNotCharge subscription', async () => {
      const caller = createCaller(organization, apiKeyToken)

      const error = await caller
        .retryBillingRunProcedure({
          billingPeriodId: billingPeriod.id,
        })
        .catch((e) => e)

      expect(error).toBeInstanceOf(TRPCError)
      expect(error.code).toBe('BAD_REQUEST')
      expect(error.message).toBe(
        'Cannot retry billing for doNotCharge subscriptions'
      )
    })
  })
})

describe('validateAndResolvePriceForSubscription', () => {
  let organization: Organization.Record
  let product: Product.Record
  let subscriptionPrice: Price.Record
  let singlePaymentPrice: Price.Record
  let customer: Customer.Record

  beforeEach(async () => {
    const setup = await setupOrg()
    organization = setup.organization
    product = setup.product

    // Setup subscription price (valid for subscriptions)
    subscriptionPrice = await setupPrice({
      productId: product.id,
      name: 'Subscription Price',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: true,
      trialPeriodDays: 0,
      currency: CurrencyCode.USD,
    })

    // Setup single payment price (invalid for subscriptions)
    singlePaymentPrice = await setupPrice({
      productId: product.id,
      name: 'Single Payment Price',
      type: PriceType.SinglePayment,
      unitPrice: 5000,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })

    // Setup customer
    customer = await setupCustomer({
      organizationId: organization.id,
      email: `test-customer+${Date.now()}@test.com`,
    })
  })

  it('returns price, product, and organization when given a valid subscription priceId', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result = await validateAndResolvePriceForSubscription({
          priceId: subscriptionPrice.id,
          customerId: customer.id,
          transaction,
        })

        expect(result.price.id).toBe(subscriptionPrice.id)
        expect(result.price.type).toBe(PriceType.Subscription)
        expect(result.product.id).toBe(product.id)
        expect(result.organization.id).toBe(organization.id)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('throws NOT_FOUND when priceId does not exist', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const nonExistentId = 'non-existent-price-id'

        await expect(
          validateAndResolvePriceForSubscription({
            priceId: nonExistentId,
            customerId: customer.id,
            transaction,
          })
        ).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: `Price with id "${nonExistentId}" not found`,
        })
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('throws BAD_REQUEST when price is a usage price (via priceId)', async () => {
    // Setup usage meter and usage price
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      livemode: true,
      pricingModelId: product.pricingModelId,
    })

    const usagePrice = await setupPrice({
      name: 'Usage Price',
      type: PriceType.Usage,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      unitPrice: 50,
      currency: CurrencyCode.USD,
      livemode: true,
      usageMeterId: usageMeter.id,
      isDefault: false,
    })(
      await adminTransactionWithResult(async ({ transaction }) => {
        await expect(
          validateAndResolvePriceForSubscription({
            priceId: usagePrice.id,
            customerId: customer.id,
            transaction,
          })
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: `Price "${usagePrice.id}" is a usage price and cannot be used to create a subscription directly. Use a subscription price instead.`,
        })
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('throws BAD_REQUEST when price is a single payment price', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        await expect(
          validateAndResolvePriceForSubscription({
            priceId: singlePaymentPrice.id,
            customerId: customer.id,
            transaction,
          })
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: `Price ${singlePaymentPrice.id} is a single payment price and cannot be used to create a subscription.`,
        })
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('throws BAD_REQUEST when neither priceId nor priceSlug is provided', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        await expect(
          validateAndResolvePriceForSubscription({
            customerId: customer.id,
            transaction,
          })
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message: 'Either priceId or priceSlug must be provided',
        })
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('throws NOT_FOUND when priceSlug does not exist for the customer', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const nonExistentSlug = 'non-existent-price-slug'

        await expect(
          validateAndResolvePriceForSubscription({
            priceSlug: nonExistentSlug,
            customerId: customer.id,
            transaction,
          })
        ).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: `Price with slug "${nonExistentSlug}" not found for this customer's pricing model`,
        })
        return Result.ok(undefined)
      })
    ).unwrap()
  })
})

describe('validateAndResolveCustomerForSubscription', () => {
  let organization: Organization.Record
  let customer: Customer.Record

  beforeEach(async () => {
    const setup = await setupOrg()
    organization = setup.organization

    // Setup customer with externalId
    customer = await setupCustomer({
      organizationId: organization.id,
      email: `test-customer+${Date.now()}@test.com`,
      externalId: `ext-${Date.now()}`,
    })
  })

  it('returns customer when given a valid customerId', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result =
          await validateAndResolveCustomerForSubscription({
            customerId: customer.id,
            organizationId: organization.id,
            transaction,
          })

        expect(result.id).toBe(customer.id)
        expect(result.email).toBe(customer.email)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('returns customer when given a valid customerExternalId', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const result =
          await validateAndResolveCustomerForSubscription({
            customerExternalId: customer.externalId!,
            organizationId: organization.id,
            transaction,
          })

        expect(result.id).toBe(customer.id)
        expect(result.externalId).toBe(customer.externalId)
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('throws NOT_FOUND when customerExternalId does not exist', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        const nonExistentExternalId = 'non-existent-external-id'

        await expect(
          validateAndResolveCustomerForSubscription({
            customerExternalId: nonExistentExternalId,
            organizationId: organization.id,
            transaction,
          })
        ).rejects.toMatchObject({
          code: 'NOT_FOUND',
          message: `Customer with externalId ${nonExistentExternalId} not found`,
        })
        return Result.ok(undefined)
      })
    ).unwrap()
  })

  it('throws BAD_REQUEST when neither customerId nor customerExternalId is provided', async () => {
    ;(
      await adminTransactionWithResult(async ({ transaction }) => {
        await expect(
          validateAndResolveCustomerForSubscription({
            organizationId: organization.id,
            transaction,
          })
        ).rejects.toMatchObject({
          code: 'BAD_REQUEST',
          message:
            'Either customerId or customerExternalId must be provided',
        })
        return Result.ok(undefined)
      })
    ).unwrap()
  })
})
