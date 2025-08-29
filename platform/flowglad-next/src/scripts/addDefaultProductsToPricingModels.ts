/* 
Run the following in the terminal to add default products to all pricing models:
NODE_ENV=production pnpm tsx src/scripts/addDefaultProductsToPricingModels.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { 
  selectPricingModels,
} from '@/db/tableMethods/pricingModelMethods'
import { 
  selectProducts,
  bulkInsertProducts,
} from '@/db/tableMethods/productMethods'
import { 
  bulkInsertPrices,
} from '@/db/tableMethods/priceMethods'
import { selectOrganizations } from '@/db/tableMethods/organizationMethods'
import { Product } from '@/db/schema/products'
import { Price } from '@/db/schema/prices'
import { PriceType, IntervalUnit } from '@/types'
import core from '@/utils/core'

async function addDefaultProductsToPricingModels(db: PostgresJsDatabase) {
  console.log('🚀 Starting migration to add default products to all pricing models...')
  
  await db.transaction(async (tx) => {
    // Get all organizations
    const organizations = await selectOrganizations({}, tx)
    console.log(`📦 Found ${organizations.length} organizations`)
    
    let totalPricingModels = 0
    let totalProductsCreated = 0
    let totalPricesCreated = 0
    let skippedPricingModels = 0
    
    // Process each organization
    for (const org of organizations) {
      console.log(`\n🏢 Processing organization: ${org.name} (${org.id})`)
      
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
            default: true 
          },
          tx
        )
        
        if (existingProducts.length > 0) {
          console.log(`  ⏭️  Skipping pricing model "${pricingModel.name}" - already has default product`)
          skippedPricingModels++
          continue
        }
        
        // Create product insert data
        const productId = core.nanoid()
        const product: Product.Insert = {
          id: productId,
          name: 'Base Plan',
          slug: 'base-plan',
          default: true,
          description: 'Default subscription plan',
          pricingModelId: pricingModel.id,
          organizationId: org.id,
          livemode: pricingModel.livemode,
          active: true,
          displayFeatures: null,
          singularQuantityLabel: 'subscription',
          pluralQuantityLabel: 'subscriptions',
          imageURL: null,
          externalId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        
        productsToInsert.push(product)
        
        // Create price insert data
        const price: Price.Insert = {
          id: core.nanoid(),
          productId: productId,
          unitPrice: 0,
          isDefault: true,
          type: PriceType.Subscription,
          intervalUnit: IntervalUnit.Month,
          intervalCount: 1,
          currency: org.defaultCurrency,
          livemode: pricingModel.livemode,
          active: true,
          name: 'Base Plan Price',
          trialPeriodDays: null,
          setupFeeAmount: null,
          usageEventsPerUnit: null,
          usageMeterId: null,
          externalId: null,
          slug: null,
          position: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        
        pricesToInsert.push(price)
        
        console.log(`  ✅ Prepared default product for pricing model: "${pricingModel.name}"`)
      }
      
      // Bulk insert products for this organization
      if (productsToInsert.length > 0) {
        await bulkInsertProducts(productsToInsert, tx)
        totalProductsCreated += productsToInsert.length
        console.log(`  📦 Created ${productsToInsert.length} default products`)
      }
      
      // Bulk insert prices for this organization
      if (pricesToInsert.length > 0) {
        await bulkInsertPrices(pricesToInsert, tx)
        totalPricesCreated += pricesToInsert.length
        console.log(`  💰 Created ${pricesToInsert.length} default prices`)
      }
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('✨ Migration completed successfully!')
    console.log('='.repeat(60))
    console.log(`📊 Summary:`)
    console.log(`  - Total pricing models processed: ${totalPricingModels}`)
    console.log(`  - Pricing models skipped (already had defaults): ${skippedPricingModels}`)
    console.log(`  - Default products created: ${totalProductsCreated}`)
    console.log(`  - Default prices created: ${totalPricesCreated}`)
    console.log('='.repeat(60))
  })
}

runScript(addDefaultProductsToPricingModels)