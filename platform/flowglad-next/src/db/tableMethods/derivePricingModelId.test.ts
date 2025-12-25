import { beforeEach, describe, expect, it } from 'vitest'
import { setupOrg, setupUsageMeter } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { core } from '@/utils/core'
import type { Organization } from '../schema/organizations'
import type { PricingModel } from '../schema/pricingModels'
import type { Product } from '../schema/products'
import type { UsageMeter } from '../schema/usageMeters'
import { derivePricingModelIdFromProduct } from './priceMethods'
import { derivePricingModelIdFromUsageMeter } from './usageMeterMethods'

describe('derivePricingModelIdFromProduct', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product
  })

  it('should successfully derive pricingModelId when product has pricingModelId', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdFromProduct(product.id, transaction)

      expect(derivedPricingModelId).toBe(product.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  // Note: We skip testing the case where product.pricingModelId is null because
  // the database schema enforces NOT NULL constraint on pricing_model_id.
  // This scenario cannot occur in production, so testing it would require
  // bypassing database constraints which is not a realistic test case.

  it('should throw an error when product does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentProductId = `prod_${core.nanoid()}`

      await expect(
        derivePricingModelIdFromProduct(
          nonExistentProductId,
          transaction
        )
      ).rejects.toThrow()
    })
  })
})

describe('derivePricingModelIdFromUsageMeter', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let usageMeter: UsageMeter.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      pricingModelId: pricingModel.id,
      livemode: true,
    })
  })

  it('should successfully derive pricingModelId when usage meter has pricingModelId', async () => {
    await adminTransaction(async ({ transaction }) => {
      const derivedPricingModelId =
        await derivePricingModelIdFromUsageMeter(
          usageMeter.id,
          transaction
        )

      expect(derivedPricingModelId).toBe(usageMeter.pricingModelId)
      expect(derivedPricingModelId).toBe(pricingModel.id)
    })
  })

  // Note: We skip testing the case where usageMeter.pricingModelId is null because
  // the database schema enforces NOT NULL constraint on pricing_model_id.
  // This scenario cannot occur in production, so testing it would require
  // bypassing database constraints which is not a realistic test case.

  it('should throw an error when usage meter does not exist', async () => {
    await adminTransaction(async ({ transaction }) => {
      const nonExistentUsageMeterId = `um_${core.nanoid()}`

      await expect(
        derivePricingModelIdFromUsageMeter(
          nonExistentUsageMeterId,
          transaction
        )
      ).rejects.toThrow()
    })
  })
})
