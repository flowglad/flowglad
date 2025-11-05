/* 
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/upsertCatalogsAndPurchases.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import {
  productToProperNounUpsert,
  selectProducts,
} from '@/db/tableMethods/productMethods'
import { bulkUpsertProperNounsByEntityId } from '@/db/tableMethods/properNounMethods'
import {
  purchaseToProperNounUpsert,
  selectPurchases,
} from '@/db/tableMethods/purchaseMethods'

async function example(db: PostgresJsDatabase) {
  return db.transaction(async (tx) => {
    const productResults = await selectProducts({}, tx)
    const productProperNounUpserts = productResults.map(
      productToProperNounUpsert
    )

    await bulkUpsertProperNounsByEntityId(
      productProperNounUpserts,
      tx
    )
    const purchaseResults = await selectPurchases({}, tx)
    const purchaseProperNounUpserts = purchaseResults.map(
      purchaseToProperNounUpsert
    )
    await bulkUpsertProperNounsByEntityId(
      purchaseProperNounUpserts,
      tx
    )
  })
}

runScript(example)
