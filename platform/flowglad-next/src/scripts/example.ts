/* 
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/example.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { customerBillingTransaction } from '@/utils/bookkeeping/customerBilling'

async function example(db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  console.log(`Calling customer billing transaction...`)
  
  await db.transaction(async (transaction) => {
    // You'll need to provide the actual externalId and organizationId
    const externalId = 'JLAunKAb08az8Ah0Rp5K4' // Replace with actual customer external ID
    const organizationId = 'org_ZAVsWTrCjgv18wwiF0J1p' // Replace with actual organization ID
    
    const billingData = await customerBillingTransaction(
      {
        externalId,
        organizationId,
      },
      transaction
    )
    
    // eslint-disable-next-line no-console
    console.log('Customer billing data:', {
      customer: billingData.customer,
      subscriptions: billingData.subscriptions.length,
      currentSubscriptions: billingData.currentSubscriptions.length,
      invoices: billingData.invoices.length,
      paymentMethods: billingData.paymentMethods.length,
      purchases: billingData.purchases.length,
    })
  })
}

runScript(example)
