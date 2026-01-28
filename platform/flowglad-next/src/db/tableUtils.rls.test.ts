/**
 * RLS tests extracted from tableUtils.test.ts
 *
 * These tests verify Row Level Security policies for organizationId integrity
 * on pricingModels, products, and prices.
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import { and as drizzleAnd, eq } from 'drizzle-orm'
import { setupOrg, setupUserAndApiKey } from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import type { ApiKey } from '@/db/schema/apiKeys'
import { nulledPriceColumns, type Price } from '@/db/schema/prices'
import {
  type PricingModel,
  pricingModels,
} from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import {
  insertPrice,
  updatePrice,
} from '@/db/tableMethods/priceMethods'
import {
  insertProduct,
  updateProduct,
} from '@/db/tableMethods/productMethods'
import { CurrencyCode, PriceType } from '@/types'
import { core } from '@/utils/core'

describe('RLS Integration Tests: organizationId integrity on pricingModels', () => {
  let org1Data: Awaited<ReturnType<typeof setupOrg>>
  let org1ApiKeyToken: string

  let org2Data: Awaited<ReturnType<typeof setupOrg>>
  let org1UserApiKey: ApiKey.Record & { token: string }
  beforeEach(async () => {
    org1Data = (await setupOrg()).unwrap() // Sets up org, product, price in livemode (presumably true)
    const userApiKeyOrg1 = (
      await setupUserAndApiKey({
        organizationId: org1Data.organization.id,
        livemode: false, // Use testmode API key to allow inserting testmode pricing models
      })
    ).unwrap()
    if (!userApiKeyOrg1.apiKey.token) {
      throw new Error('API key token not found after setup for org1')
    }
    org1ApiKeyToken = userApiKeyOrg1.apiKey.token
    org1UserApiKey = userApiKeyOrg1.apiKey
    org2Data = (await setupOrg()).unwrap() // Sets up another org
  })

  it('should ALLOW a user to manage pricingModels, products, and prices within their organization', async () => {
    await authenticatedTransaction(
      async (ctx) => {
        const { transaction, livemode } = ctx
        expect(livemode).toBe(org1UserApiKey.livemode) // Session livemode matches API key (false, testmode)

        const newPricingModelInput: PricingModel.Insert = {
          name: 'Test Allowed RLS PricingModel',
          organizationId: org1Data.organization.id,
          livemode: false, // Use testmode to avoid livemode uniqueness constraint (org already has livemode pricing model from setupOrg)
        }

        // INSERT
        const createdPricingModelResult = await transaction
          .insert(pricingModels)
          .values(newPricingModelInput)
          .returning()
        expect(createdPricingModelResult.length).toBe(1)
        const createdPricingModel =
          createdPricingModelResult[0] as typeof pricingModels.$inferSelect
        expect(createdPricingModel.name).toBe(
          'Test Allowed RLS PricingModel'
        )
        expect(createdPricingModel.organizationId).toBe(
          org1Data.organization.id
        )
        const pricingModelId = createdPricingModel.id
        // SELECT
        const selectedPricingModels = await transaction
          .select()
          .from(pricingModels)
          .where(eq(pricingModels.id, pricingModelId))
        expect(selectedPricingModels.length).toBe(1)
        expect(selectedPricingModels[0].id).toBe(pricingModelId)

        // UPDATE
        const updatedPricingModelResult = await transaction
          .update(pricingModels)
          .set({ name: 'Updated Allowed RLS PricingModel' })
          .where(eq(pricingModels.id, pricingModelId))
          .returning()
        expect(updatedPricingModelResult.length).toBe(1)
        expect(updatedPricingModelResult[0].name).toBe(
          'Updated Allowed RLS PricingModel'
        )

        const productInsert: Product.Insert = {
          name: 'Test Product',
          organizationId: org1Data.organization.id,
          livemode,
          description: 'Test product description',
          imageURL: 'https://example.com/test-product.jpg',
          singularQuantityLabel:
            'Test product singular quantity label',
          pluralQuantityLabel: 'Test product plural quantity label',
          active: true,
          externalId: null,
          pricingModelId: org1Data.testmodePricingModel.id, // Use testmode pricing model to match testmode session
          default: false,
          slug: `flowglad-test-product-price+${core.nanoid()}`,
        }
        const createdProduct = await insertProduct(productInsert, ctx)

        // Create a price to test RLS
        const priceInput: Price.Insert = {
          ...nulledPriceColumns,
          name: 'Test Price',
          livemode,
          productId: createdProduct.id,
          unitPrice: 1000,
          currency: CurrencyCode.USD,
          type: PriceType.SinglePayment,
          active: true,
          externalId: null,
          isDefault: false,
          slug: `flowglad-test-product-price+${core.nanoid()}`,
        }

        const createdPrice = await insertPrice(priceInput, ctx)
        expect(createdPrice.name).toBe('Test Price')

        // Test price update
        const updatedPrice = await updatePrice(
          {
            id: createdPrice.id,
            name: 'Updated Test Price',
            unitPrice: 2000,
            type: PriceType.SinglePayment,
            intervalUnit: null,
            intervalCount: null,
            active: true,
            externalId: null,
            usageMeterId: null,
            isDefault: false,
          },
          ctx
        )
        expect(updatedPrice.name).toBe('Updated Test Price')
        expect(updatedPrice.unitPrice).toBe(2000)

        // Test product update
        const updatedProduct = await updateProduct(
          {
            id: createdProduct.id,
            name: 'Updated Test Product',
            description: 'Updated test product description',
          },
          ctx
        )
        expect(updatedProduct.name).toBe('Updated Test Product')
        expect(updatedProduct.description).toBe(
          'Updated test product description'
        )
      },
      { apiKey: org1ApiKeyToken }
    )
  })

  it('should DENY a user from creating a pricingModel for another organization due to RLS', async () => {
    const pricingModelNameAttempt =
      'Test Denied RLS PricingModel - Other Org'
    try {
      await authenticatedTransaction(
        async (ctx) => {
          const { transaction, livemode } = ctx
          expect(livemode).toBe(org1UserApiKey.livemode) // Session livemode is true
          const newPricingModelInput: PricingModel.Insert = {
            name: pricingModelNameAttempt,
            organizationId: org2Data.organization.id, // Attempting to use other org's ID
            livemode, // PricingModel livemode matches session, but orgId is wrong
          }
          await transaction
            .insert(pricingModels)
            .values(newPricingModelInput)
            .returning()
          // Should not reach here
          throw new Error(
            'PricingModel insert was unexpectedly allowed for another organization'
          )
        },
        { apiKey: org1ApiKeyToken }
      )
    } catch (error: any) {
      expect(error.message).toContain(
        'Failed query: insert into "pricing_models"'
      )
    }

    // Verify (using admin) that the pricingModel was not actually created
    const checkPricingModel = await adminTransaction(async (ctx) => {
      const { transaction } = ctx
      return transaction
        .select()
        .from(pricingModels)
        .where(
          drizzleAnd(
            eq(
              pricingModels.organizationId,
              org2Data.organization.id
            ),
            eq(pricingModels.name, pricingModelNameAttempt)
          )
        )
    })
    expect(checkPricingModel.length).toBe(0)
  })
})
