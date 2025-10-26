/* 
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/importCustomersToProductPricePurchase.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { selectCustomersByOrganizationIdAndEmails } from '@/db/tableMethods/customerMethods'
import { purchasesInsertSchema } from '@/db/schema/purchases'
import {
  createManualPurchaseInsert,
  customerInsertsFromCSV,
} from '@/utils/purchaseHelpers'
import { selectPriceById } from '@/db/tableMethods/priceMethods'
import { bulkInsertPurchases } from '@/db/tableMethods/purchaseMethods'
import path from 'path'
import fs from 'fs/promises'

const ORGANIZATION_ID = 'org_RwGO71TWVQLbIT14cjnHh'
const VARIANT_ID = 'vrnt_sK7IPE2t8ptpFVZz4Yx2m'

const example = async (db: PostgresJsDatabase) => {
  // Read the CSV file
  const csvPath = path.join(
    process.cwd(),
    'src',
    'scripts',
    'data',
    'input.csv'
  )
  const csvContent = await fs.readFile(csvPath, 'utf-8')
  await db.transaction(async (transaction) => {
    const { customerInserts } = await customerInsertsFromCSV(
      csvContent,
      ORGANIZATION_ID,
      true
    )

    const price = await selectPriceById(VARIANT_ID, transaction)
    const customers = await selectCustomersByOrganizationIdAndEmails(
      ORGANIZATION_ID,
      customerInserts.map((customer) => customer.email),
      transaction
    )
    const purchaseInserts = customers.map((customer) => {
      return createManualPurchaseInsert({
        customer,
        price,
        organizationId: ORGANIZATION_ID,
      })
    })

    const validPurchases = purchaseInserts.map((purchase) =>
      purchasesInsertSchema.parse(purchase)
    )
    await bulkInsertPurchases(validPurchases, transaction)
  })
}

runScript(example)
