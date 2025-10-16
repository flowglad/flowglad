/* 
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/rehydrateBillingPeriodItems.ts billing_period_id=bp_...
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import runScript from './scriptRunner'
import { selectSubscriptionAndItems } from '@/db/tableMethods/subscriptionItemMethods'
import { BillingPeriodItem } from '@/db/schema/billingPeriodItems'
import {
  bulkInsertBillingPeriodItems,
  selectBillingPeriodItems,
} from '@/db/tableMethods/billingPeriodItemMethods'
import { PriceType, SubscriptionItemType } from '@/types'
import { selectPriceById } from '@/db/tableMethods/priceMethods'

async function rehydrateBillingPeriodItems(db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  // Get the stripe subscription ID from command line arguments
  const args = process.argv.slice(2)
  const billingPeriodIdArg = args.find((arg) =>
    arg.startsWith('billing_period_id=')
  )

  if (!billingPeriodIdArg) {
    console.error('Error: billing_period_id argument is required')
    console.error(
      'Usage: NODE_ENV=production pnpm tsx src/scripts/rehydrateBillingPeriodItems.ts billing_period_id=bp_...'
    )
    process.exit(1)
  }

  const billingPeriodId = billingPeriodIdArg.split('=')[1]
  if (!billingPeriodId) {
    throw new Error(
      'Please provide a billing period ID as a command line argument'
    )
  }
  await db.transaction(async (transaction) => {
    const billingPeriod = await selectBillingPeriodById(
      billingPeriodId,
      transaction
    )
    const result = await selectSubscriptionAndItems(
      { id: billingPeriod.subscriptionId },
      transaction
    )
    const existingBillingPeriodItems = await selectBillingPeriodItems(
      { billingPeriodId: billingPeriod.id },
      transaction
    )
    if (existingBillingPeriodItems.length > 0) {
      throw new Error(
        `Billing period items already exist for billing period ${billingPeriod.id}`
      )
    }
    const billingPeriodItemInserts: BillingPeriodItem.Insert[] = []
    if (result?.subscriptionItems) {
      for (const item of result.subscriptionItems) {
        if (
          item.expiredAt &&
          item.expiredAt > billingPeriod.endDate
        ) {
          continue
        }
        if (item.createdAt > billingPeriod.startDate) {
          continue
        }
        const price = await selectPriceById(item.priceId, transaction)
        if (price.type === PriceType.Usage) {
          const insert: BillingPeriodItem.UsageInsert = {
            billingPeriodId: billingPeriod.id,
            name: item.name ?? '',
            description: item.name ?? '',
            livemode: item.livemode,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            type: SubscriptionItemType.Usage,
            usageMeterId: price.usageMeterId,
            usageEventsPerUnit: price.usageEventsPerUnit,
            discountRedemptionId: null,
          }
          billingPeriodItemInserts.push(insert)
        } else {
          const insert: BillingPeriodItem.StaticInsert = {
            billingPeriodId: billingPeriod.id,
            name: item.name ?? '',
            description: item.name ?? '',
            livemode: item.livemode,
            type: item.type,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            discountRedemptionId: null,
          }
          billingPeriodItemInserts.push(insert)
        }
      }
    }
    await bulkInsertBillingPeriodItems(
      billingPeriodItemInserts,
      transaction
    )
  })
}

runScript(rehydrateBillingPeriodItems)
