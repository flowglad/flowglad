import { beforeEach, describe, expect, it } from 'bun:test'
import { Result } from 'better-result'
import { sql } from 'drizzle-orm'
import {
  setupCustomer,
  setupOrg,
  setupPrice,
  setupPricingModel,
  setupUsageMeter,
  setupUserAndApiKey,
} from '@/../seedDatabase'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import db from '@/db/client'
import type { ApiKey } from '@/db/schema/apiKeys'
import type { Customer } from '@/db/schema/customers'
import type { Organization } from '@/db/schema/organizations'
import type { Price } from '@/db/schema/prices'
import type { PricingModel } from '@/db/schema/pricingModels'
import type { Product } from '@/db/schema/products'
import type { UsageMeter } from '@/db/schema/usageMeters'
import type { User } from '@/db/schema/users'
import {
  insertPrice,
  selectPriceById,
  selectPrices,
  updatePrice,
} from '@/db/tableMethods/priceMethods'
import { insertUser } from '@/db/tableMethods/userMethods'
import type { DbTransaction } from '@/db/types'
import { CurrencyCode, IntervalUnit, PriceType } from '@/types'
import core from '@/utils/core'

/**
 * RLS tests for the prices table.
 *
 * The prices table has 3 RLS policies:
 * 1. merchantPolicy "Merchant access via product or usage meter FK" - for ALL operations
 *    - Usage prices: usage_meter_id must be visible (RLS-scoped)
 *    - Non-usage prices: product_id must be visible (RLS-scoped)
 *
 * 2. merchantPolicy "On update, ensure usage meter belongs to same pricing model"
 *    - for UPDATE: withCheck ensures usage_meter_id belongs to same pricing model
 *
 * 3. enableCustomerReadPolicy "Enable read for customers"
 *    - for SELECT: active = true AND (product_id visible OR (product_id IS NULL AND usage_meter_id visible))
 */

/**
 * Helper function to create an authenticated transaction with customer role.
 * This simulates a customer accessing the billing portal with proper RLS context.
 */
async function authenticatedCustomerTransaction<T>(
  customer: Customer.Record,
  user: User.Record,
  organization: Organization.Record,
  fn: (params: {
    transaction: DbTransaction
    userId: string
    organizationId: string
    livemode: boolean
  }) => Promise<T>
): Promise<T> {
  return db.transaction(async (transaction) => {
    const jwtClaim = {
      role: 'customer',
      sub: user.id,
      email: user.email || 'customer@test.com',
      organization_id: organization.id,
      livemode: customer.livemode,
      user_metadata: {
        id: user.id,
        email: user.email || 'customer@test.com',
        role: 'customer',
        user_metadata: {},
        aud: 'test',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        app_metadata: {
          provider: 'customerBillingPortal',
        },
      },
      app_metadata: {
        provider: 'customerBillingPortal',
      },
    }

    // Set RLS context for customer role
    await transaction.execute(
      sql`SELECT set_config('request.jwt.claims', '${sql.raw(
        JSON.stringify(jwtClaim)
      )}', TRUE)`
    )
    await transaction.execute(sql`SET LOCAL ROLE customer`)
    await transaction.execute(
      sql`SELECT set_config('app.livemode', '${sql.raw(
        customer.livemode.toString()
      )}', TRUE)`
    )

    const result = await fn({
      transaction,
      userId: user.id,
      organizationId: organization.id,
      livemode: customer.livemode,
    })

    try {
      await transaction.execute(sql`RESET ROLE`)
    } catch (e) {
      // If the transaction is aborted (e.g., due to RLS policy violation),
      // RESET ROLE will fail. This is expected behavior.
    }

    return result
  })
}

describe('prices RLS - merchant role access via product or usage meter FK', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let apiKey: ApiKey.Record
  let usageMeter: UsageMeter.Record

  beforeEach(async () => {
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    const userApiKey = (
      await setupUserAndApiKey({
        organizationId: organization.id,
        livemode: true,
      })
    ).unwrap()
    apiKey = userApiKey.apiKey

    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Test Usage Meter',
      livemode: true,
    })
  })

  describe('INSERT operations', () => {
    it('allows merchant to insert a subscription price for their own product', async () => {
      const priceInsert: Price.SubscriptionInsert = {
        productId: product.id,
        name: 'Test Subscription Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        pricingModelId: pricingModel.id,
        usageEventsPerUnit: null,
        usageMeterId: null,
      }

      const inserted = await authenticatedTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return insertPrice(priceInsert, ctx)
        },
        { apiKey: apiKey.token }
      )

      expect(inserted.id).toMatch(/^price_/)
      expect(inserted.productId).toBe(product.id)
      expect(inserted.type).toBe(PriceType.Subscription)
      expect(inserted.unitPrice).toBe(1000)
    })

    it('allows merchant to insert a usage price for their own usage meter', async () => {
      const priceInsert: Price.UsageInsert = {
        usageMeterId: usageMeter.id,
        productId: null,
        name: 'Test Usage Price',
        type: PriceType.Usage,
        unitPrice: 50,
        usageEventsPerUnit: 1,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        pricingModelId: pricingModel.id,
        trialPeriodDays: null,
      }

      const inserted = await authenticatedTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return insertPrice(priceInsert, ctx)
        },
        { apiKey: apiKey.token }
      )

      expect(inserted.id).toMatch(/^price_/)
      expect(inserted.usageMeterId).toBe(usageMeter.id)
      expect(inserted.productId).toBeNull()
      expect(inserted.type).toBe(PriceType.Usage)
    })

    it('denies merchant from inserting a subscription price for another organization product', async () => {
      // Create another organization
      const org2Data = (await setupOrg()).unwrap()
      const org2ApiKey = (
        await setupUserAndApiKey({
          organizationId: org2Data.organization.id,
          livemode: true,
        })
      ).unwrap()

      // Try to insert a price for org1's product using org2's API key
      const priceInsert: Price.SubscriptionInsert = {
        productId: product.id, // org1's product
        name: 'Unauthorized Price',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        pricingModelId: pricingModel.id,
        usageEventsPerUnit: null,
        usageMeterId: null,
      }

      await expect(
        authenticatedTransaction(
          async (ctx) => {
            const { transaction } = ctx
            return insertPrice(priceInsert, ctx)
          },
          { apiKey: org2ApiKey.apiKey.token }
        )
      ).rejects.toThrow()
    })

    it('denies merchant from inserting a usage price for another organization usage meter', async () => {
      // Create another organization
      const org2Data = (await setupOrg()).unwrap()
      const org2ApiKey = (
        await setupUserAndApiKey({
          organizationId: org2Data.organization.id,
          livemode: true,
        })
      ).unwrap()

      // Try to insert a usage price for org1's usage meter using org2's API key
      const priceInsert: Price.UsageInsert = {
        usageMeterId: usageMeter.id, // org1's usage meter
        productId: null,
        name: 'Unauthorized Usage Price',
        type: PriceType.Usage,
        unitPrice: 50,
        usageEventsPerUnit: 1,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
        pricingModelId: pricingModel.id,
        trialPeriodDays: null,
      }

      await expect(
        authenticatedTransaction(
          async (ctx) => {
            const { transaction } = ctx
            return insertPrice(priceInsert, ctx)
          },
          { apiKey: org2ApiKey.apiKey.token }
        )
      ).rejects.toThrow()
    })
  })

  describe('SELECT operations', () => {
    it('allows merchant to select subscription prices for their own products', async () => {
      // Create a subscription price using setupPrice
      const subscriptionPrice = await setupPrice({
        productId: product.id,
        name: 'Subscription Price For Select',
        type: PriceType.Subscription,
        unitPrice: 2000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
      })

      // Select via authenticated transaction
      const selected = await authenticatedTransaction(
        async ({ transaction }) => {
          return (
            await selectPriceById(subscriptionPrice.id, transaction)
          ).unwrap()
        },
        { apiKey: apiKey.token }
      )

      expect(selected.id).toBe(subscriptionPrice.id)
      expect(selected.productId).toBe(product.id)
      expect(selected.type).toBe(PriceType.Subscription)
    })

    it('allows merchant to select usage prices for their own usage meters', async () => {
      // Create a usage price using setupPrice
      const usagePrice = await setupPrice({
        usageMeterId: usageMeter.id,
        name: 'Usage Price For Select',
        type: PriceType.Usage,
        unitPrice: 100,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
      })

      // Select via authenticated transaction
      const selected = await authenticatedTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return (
            await selectPriceById(usagePrice.id, transaction)
          ).unwrap()
        },
        { apiKey: apiKey.token }
      )

      expect(selected.id).toBe(usagePrice.id)
      expect(selected.usageMeterId).toBe(usageMeter.id)
      expect(selected.type).toBe(PriceType.Usage)
    })

    it('denies merchant from selecting prices from another organization products', async () => {
      // Create another organization with a price
      const org2Data = (await setupOrg()).unwrap()
      const org2Price = await setupPrice({
        productId: org2Data.product.id,
        name: 'Org2 Price',
        type: PriceType.Subscription,
        unitPrice: 3000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
      })

      // Try to select org2's price using org1's API key
      const prices = await authenticatedTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return selectPrices(
            { productId: org2Data.product.id },
            transaction
          )
        },
        { apiKey: apiKey.token }
      )

      // Should return empty array since org1 can't see org2's products/prices
      expect(prices).toHaveLength(0)

      // Verify the price exists via admin transaction
      const adminPrices = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await selectPrices(
              { productId: org2Data.product.id },
              transaction
            )
          )
        })
      ).unwrap()
      expect(adminPrices.length).toBeGreaterThan(0)
      expect(adminPrices.some((p) => p.id === org2Price.id)).toBe(
        true
      )
    })

    it('denies merchant from selecting usage prices from another organization usage meters', async () => {
      // Create another organization with a usage meter and price
      const org2Data = (await setupOrg()).unwrap()
      const org2UsageMeter = await setupUsageMeter({
        organizationId: org2Data.organization.id,
        name: 'Org2 Usage Meter',
        livemode: true,
      })
      const org2UsagePrice = await setupPrice({
        usageMeterId: org2UsageMeter.id,
        name: 'Org2 Usage Price',
        type: PriceType.Usage,
        unitPrice: 200,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
      })

      // Try to select org2's usage price using org1's API key
      const prices = await authenticatedTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return selectPrices(
            { usageMeterId: org2UsageMeter.id },
            transaction
          )
        },
        { apiKey: apiKey.token }
      )

      // Should return empty array
      expect(prices).toHaveLength(0)

      // Verify the price exists via admin transaction
      const adminPrices = (
        await adminTransaction(async (ctx) => {
          const { transaction } = ctx
          return Result.ok(
            await selectPrices(
              { usageMeterId: org2UsageMeter.id },
              transaction
            )
          )
        })
      ).unwrap()
      expect(
        adminPrices.some((p) => p.id === org2UsagePrice.id)
      ).toBe(true)
    })
  })

  describe('UPDATE operations', () => {
    it('allows merchant to update their own subscription price', async () => {
      // Create a subscription price using setupPrice
      const subscriptionPrice = await setupPrice({
        productId: product.id,
        name: 'Original Subscription Name',
        type: PriceType.Subscription,
        unitPrice: 1000,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
      })

      // Update via authenticated transaction
      const updated = await authenticatedTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return updatePrice(
            {
              id: subscriptionPrice.id,
              name: 'Updated Subscription Name',
              type: PriceType.Subscription,
            },
            ctx
          )
        },
        { apiKey: apiKey.token }
      )

      expect(updated.id).toBe(subscriptionPrice.id)
      expect(updated.name).toBe('Updated Subscription Name')
    })

    it('allows merchant to update their own usage price', async () => {
      // Create a usage price using setupPrice
      const usagePrice = await setupPrice({
        usageMeterId: usageMeter.id,
        name: 'Original Usage Name',
        type: PriceType.Usage,
        unitPrice: 100,
        intervalUnit: IntervalUnit.Month,
        intervalCount: 1,
        livemode: true,
        isDefault: false,
        currency: CurrencyCode.USD,
      })

      // Update via authenticated transaction
      const updated = await authenticatedTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return updatePrice(
            {
              id: usagePrice.id,
              name: 'Updated Usage Name',
              type: PriceType.Usage,
            },
            ctx
          )
        },
        { apiKey: apiKey.token }
      )

      expect(updated.id).toBe(usagePrice.id)
      expect(updated.name).toBe('Updated Usage Name')
    })
  })
})

describe('prices RLS - merchant update policy for usage meter validation', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let apiKey: ApiKey.Record
  let usageMeter1: UsageMeter.Record
  let usageMeter2: UsageMeter.Record
  let usagePrice: Price.UsageRecord

  beforeEach(async () => {
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    pricingModel = orgData.pricingModel

    const userApiKey = (
      await setupUserAndApiKey({
        organizationId: organization.id,
        livemode: true,
      })
    ).unwrap()
    apiKey = userApiKey.apiKey

    // Create two usage meters in the same pricing model
    usageMeter1 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Usage Meter 1',
      livemode: true,
    })

    usageMeter2 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Usage Meter 2',
      livemode: true,
    })

    // Create a usage price for the first usage meter
    usagePrice = (await setupPrice({
      usageMeterId: usageMeter1.id,
      name: 'Usage Price for Meter 1',
      type: PriceType.Usage,
      unitPrice: 100,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
    })) as Price.UsageRecord
  })

  it('allows updating a usage price to use a different usage meter in the same pricing model', async () => {
    // Update the usage price to use usageMeter2 (same pricing model)
    const updated = await authenticatedTransaction(
      async (ctx) => {
        const { transaction } = ctx
        return updatePrice(
          {
            id: usagePrice.id,
            usageMeterId: usageMeter2.id,
            type: PriceType.Usage,
          },
          ctx
        )
      },
      { apiKey: apiKey.token }
    )

    expect(updated.id).toBe(usagePrice.id)
    expect(updated.usageMeterId).toBe(usageMeter2.id)
  })

  it('denies updating a usage price to use a usage meter from a different pricing model', async () => {
    // Create a second pricing model for the same organization (use testmode to avoid livemode uniqueness constraint)
    const pricingModel2 = await setupPricingModel({
      organizationId: organization.id,
      name: 'Second Pricing Model',
      livemode: false,
    })

    // Create a usage meter in the second pricing model
    const usageMeterInPM2 = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Usage Meter in PM2',
      pricingModelId: pricingModel2.id,
      livemode: false,
    })

    // The update should fail because the RLS policy requires the usage meter's
    // pricing_model_id to match the price's pricing_model_id
    await expect(
      authenticatedTransaction(
        async (ctx) => {
          const { transaction } = ctx
          return updatePrice(
            {
              id: usagePrice.id,
              usageMeterId: usageMeterInPM2.id,
              type: PriceType.Usage,
            },
            ctx
          )
        },
        { apiKey: apiKey.token }
      )
    ).rejects.toThrow()
  })
})

describe('prices RLS - customer read access', () => {
  let organization: Organization.Record
  let pricingModel: PricingModel.Record
  let product: Product.Record
  let customer: Customer.Record
  let customerUser: User.Record
  let usageMeter: UsageMeter.Record

  beforeEach(async () => {
    const orgData = (await setupOrg()).unwrap()
    organization = orgData.organization
    pricingModel = orgData.pricingModel
    product = orgData.product

    // Create a user for the customer
    customerUser = (
      await adminTransaction(async (ctx) => {
        const { transaction } = ctx
        return Result.ok(
          await insertUser(
            {
              id: `usr_${core.nanoid()}`,
              email: `customer_${core.nanoid()}@test.com`,
              name: 'Test Customer User',
            },
            transaction
          )
        )
      })
    ).unwrap()

    // Create a customer
    customer = (
      await setupCustomer({
        organizationId: organization.id,
        email: customerUser.email!,
        userId: customerUser.id,
        livemode: true,
      })
    ).unwrap()

    // Create a usage meter
    usageMeter = await setupUsageMeter({
      organizationId: organization.id,
      name: 'Customer Test Usage Meter',
      livemode: true,
    })
  })

  it('allows customer to read active subscription prices for visible products', async () => {
    // Create an active subscription price
    const activePrice = await setupPrice({
      productId: product.id,
      name: 'Active Subscription Price',
      type: PriceType.Subscription,
      unitPrice: 1000,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
      active: true,
    })

    // Select via customer authenticated transaction
    const prices = await authenticatedCustomerTransaction(
      customer,
      customerUser,
      organization,
      async (ctx) => {
        const { transaction } = ctx
        return selectPrices({ productId: product.id }, transaction)
      }
    )

    // Should include the active price (and the default price from setupOrg)
    expect(prices.some((p) => p.id === activePrice.id)).toBe(true)
  })

  it('allows customer to read active usage prices for visible usage meters', async () => {
    // Create an active usage price
    const activeUsagePrice = await setupPrice({
      usageMeterId: usageMeter.id,
      name: 'Active Usage Price',
      type: PriceType.Usage,
      unitPrice: 50,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
      livemode: true,
      isDefault: false,
      currency: CurrencyCode.USD,
      active: true,
    })

    // Select via customer authenticated transaction
    const prices = await authenticatedCustomerTransaction(
      customer,
      customerUser,
      organization,
      async (ctx) => {
        const { transaction } = ctx
        return selectPrices(
          { usageMeterId: usageMeter.id },
          transaction
        )
      }
    )

    expect(prices.some((p) => p.id === activeUsagePrice.id)).toBe(
      true
    )
  })
})
