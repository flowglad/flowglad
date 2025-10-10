/* 
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/verifyMetadataUpgrades.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { selectPurchases } from '@/db/tableMethods/purchaseMethods'
import { purchasesSelectSchema } from '@/db/schema/purchases'
import { selectCheckoutSessions } from '@/db/tableMethods/checkoutSessionMethods'
import { checkoutSessionsSelectSchema } from '@/db/schema/checkoutSessions'

async function verifyMetadataUpgrades(db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  console.log(`foo`)
  await db.transaction(async (tx) => {
    const purchases = await selectCheckoutSessions({}, tx)
    const safeParsedPurchases = purchases.map((purchase) => {
      const result = checkoutSessionsSelectSchema.safeParse(purchase)
      if (!result.success) {
        console.log(
          `Error parsing purchase ${purchase.id}: ${result.error.issues}`
        )
      }
      return result.data
    })
    if (
      safeParsedPurchases.some((purchase) => purchase === undefined)
    ) {
      console.log('Some purchases were not parsed successfully')
    } else {
      console.log('All purchases were parsed successfully')
    }
  })
}

runScript(verifyMetadataUpgrades)
