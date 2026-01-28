/* 
Run the following in the terminal to add default products to all pricing models:
NODE_ENV=production bunx tsx src/scripts/addDefaultProductsToPricingModels.ts
*/

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { Price } from '@/db/schema/prices'
import type { Product } from '@/db/schema/products'
import { selectOrganizations } from '@/db/tableMethods/organizationMethods'
import { bulkInsertPrices } from '@/db/tableMethods/priceMethods'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import {
  bulkInsertProducts,
  selectProducts,
} from '@/db/tableMethods/productMethods'
import { createTransactionEffectsContext } from '@/db/types'
import { IntervalUnit, PriceType } from '@/types'
import {
  createFreePlanPriceInsert,
  createFreePlanProductInsert,
} from '@/utils/bookkeeping'
import core from '@/utils/core'
import runScript from './scriptRunner'

/* eslint-disable no-console */
async function addDefaultProductsToPricingModels(
  db: PostgresJsDatabase
) {
  console.log(
    '🚀 Starting migration to add default products to all pricing models...'
  )

  await db.transaction(async (tx) => {
    // Create transaction context with noop callbacks for scripts
    const ctx = createTransactionEffectsContext(tx, {
      type: 'admin',
      livemode: true,
    })

    // Get all organizations
    const organizations = await selectOrganizations({}, tx)
    console.log(`📦 Found ${organizations.length} organizations`)

    let totalPricingModels = 0
    let totalProductsCreated = 0
    let totalPricesCreated = 0
    let skippedPricingModels = 0

    // Process each organization
    for (const org of organizations) {
      console.log(
        `\n🏢 Processing organization: ${org.name} (${org.id})`
      )

      // Get all pricing models for this organization (both livemode true and false)
      const pricingModels = await selectPricingModels(
        { organizationId: org.id },
        tx
      )

      console.log(`  📋 Found ${pricingModels.length} pricing models`)
      totalPricingModels += pricingModels.length

      // Prepare products and prices to bulk insert
      const productsToInsert: Product.Insert[] = []
      const pricesToInsert: Price.Insert[] = []

      for (const pricingModel of pricingModels) {
        // Check if this pricing model already has a default product
        const existingProducts = await selectProducts(
          {
            pricingModelId: pricingModel.id,
            default: true,
          },
          tx
        )

        if (existingProducts.length > 0) {
          console.log(
            `  ⏭️  Skipping pricing model "${pricingModel.name}" - already has default product`
          )
          skippedPricingModels++
          continue
        }

        // Create product insert data
        const product: Product.Insert =
          createFreePlanProductInsert(pricingModel)

        productsToInsert.push(product)

        console.log(
          `  ✅ Prepared default product for pricing model: "${pricingModel.name}"`
        )
      }
      let products: Product.Record[]
      // Bulk insert products for this organization
      if (productsToInsert.length > 0) {
        products = await bulkInsertProducts(productsToInsert, ctx)
        totalProductsCreated += productsToInsert.length
        console.log(
          `  📦 Created ${productsToInsert.length} default products`
        )
        for (const product of products) {
          const price: Price.Insert = createFreePlanPriceInsert(
            product,
            org.defaultCurrency
          )
          pricesToInsert.push(price)
        }
      }

      // Bulk insert prices for this organization
      if (pricesToInsert.length > 0) {
        await bulkInsertPrices(pricesToInsert, ctx)
        totalPricesCreated += pricesToInsert.length
        console.log(
          `  💰 Created ${pricesToInsert.length} default prices`
        )
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('✨ Migration completed successfully!')
    console.log('='.repeat(60))
    console.log(`📊 Summary:`)
    console.log(
      `  - Total pricing models processed: ${totalPricingModels}`
    )
    console.log(
      `  - Pricing models skipped (already had defaults): ${skippedPricingModels}`
    )
    console.log(
      `  - Default products created: ${totalProductsCreated}`
    )
    console.log(`  - Default prices created: ${totalPricesCreated}`)
    console.log('='.repeat(60))
  })
}

runScript(addDefaultProductsToPricingModels)
