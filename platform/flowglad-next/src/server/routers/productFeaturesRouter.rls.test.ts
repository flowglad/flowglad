import { beforeEach, describe, expect, it } from 'bun:test'
import {
  setupOrg,
  setupPrice,
  setupProduct,
  setupToggleFeature,
  setupUsageCreditGrantFeature,
  setupUsageMeter,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import type { Feature } from '@/db/schema/features'
import type { Organization } from '@/db/schema/organizations'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import { productFeaturesRouter } from '@/server/routers/productFeaturesRouter'
import { FeatureUsageGrantFrequency, PriceType } from '@/types'
import { core } from '@/utils/core'

describe('productFeaturesRouter.create - Toggle Feature Validation', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let subscriptionProduct: Product.Record
  let singlePaymentProduct: Product.Record
  let toggleFeature: Feature.Record
  let usageCreditGrantFeature: Feature.Record
  let apiKeyToken: string
  let ctx: {
    organizationId: string
    apiKey: string
    livemode: boolean
    environment: 'live' | 'test'
    isApi: boolean
    path: string
  }

  beforeEach(async () => {
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    const { apiKey } = (
      await setupUserAndApiKey({
        organizationId: organization.id,
        livemode: true,
      })
    ).unwrap()
    if (!apiKey.token) {
      throw new Error('API key token not found after setup')
    }
    apiKeyToken = apiKey.token

    ctx = {
      organizationId: organization.id,
      apiKey: apiKeyToken,
      livemode: true,
      environment: 'live',
      isApi: true,
      path: '',
    }

    // Create a subscription product
    subscriptionProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Subscription Product',
      livemode: true,
    })
    await setupPrice({
      productId: subscriptionProduct.id,
      name: 'Monthly Subscription',
      livemode: true,
      isDefault: true,
      type: PriceType.Subscription,
      unitPrice: 1999,
    })

    // Create a single payment product
    singlePaymentProduct = await setupProduct({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Single Payment Product',
      livemode: true,
    })
    await setupPrice({
      productId: singlePaymentProduct.id,
      name: 'One-time Purchase',
      livemode: true,
      isDefault: true,
      type: PriceType.SinglePayment,
      unitPrice: 4999,
    })

    // Create a toggle feature
    toggleFeature = await setupToggleFeature({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'Premium Access',
      livemode: true,
    })

    // Create a usage meter and usage credit grant feature
    const usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'API Calls',
      slug: `api-calls-${core.nanoid()}`,
      livemode: true,
    })

    usageCreditGrantFeature = await setupUsageCreditGrantFeature({
      organizationId: organization.id,
      pricingModelId: pricingModel.id,
      name: 'API Credits',
      usageMeterId: usageMeter.id,
      renewalFrequency: FeatureUsageGrantFrequency.Once,
      livemode: true,
      amount: 1000,
    })
  })

  it('should throw an error when associating a toggle feature with a SinglePayment product', async () => {
    await expect(
      productFeaturesRouter.createCaller(ctx).create({
        productFeature: {
          productId: singlePaymentProduct.id,
          featureId: toggleFeature.id,
        },
      })
    ).rejects.toThrow(
      'Cannot associate toggle features with single payment products. Toggle features require subscription-based pricing.'
    )
  })

  it('should allow associating a toggle feature with a Subscription product', async () => {
    const result = await productFeaturesRouter
      .createCaller(ctx)
      .create({
        productFeature: {
          productId: subscriptionProduct.id,
          featureId: toggleFeature.id,
        },
      })

    expect(result.productFeature).toMatchObject({
      productId: subscriptionProduct.id,
      featureId: toggleFeature.id,
    })
    expect(result.productFeature.expiredAt).toBeNull()
  })

  it('should allow associating a usage credit grant feature with a SinglePayment product', async () => {
    const result = await productFeaturesRouter
      .createCaller(ctx)
      .create({
        productFeature: {
          productId: singlePaymentProduct.id,
          featureId: usageCreditGrantFeature.id,
        },
      })

    expect(result.productFeature).toMatchObject({
      productId: singlePaymentProduct.id,
      featureId: usageCreditGrantFeature.id,
    })
    expect(result.productFeature.expiredAt).toBeNull()
  })

  it('should allow associating a usage credit grant feature with a Subscription product', async () => {
    const result = await productFeaturesRouter
      .createCaller(ctx)
      .create({
        productFeature: {
          productId: subscriptionProduct.id,
          featureId: usageCreditGrantFeature.id,
        },
      })

    expect(result.productFeature).toMatchObject({
      productId: subscriptionProduct.id,
      featureId: usageCreditGrantFeature.id,
    })
    expect(result.productFeature.expiredAt).toBeNull()
  })
})
