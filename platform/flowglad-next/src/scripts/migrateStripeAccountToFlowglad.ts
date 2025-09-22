/* 
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/migrateStripeAccountToFlowglad.ts connected_account_id=acct_...
*/
/* eslint-disable no-console */

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { selectOrganizations } from '@/db/tableMethods/organizationMethods'


/**
 * 1. insert or do nothing customers
 * 2. for each customer, insert or do nothing platform payment methods with external id = payment method . fingerprint
 *
 */




/**
 * In 3 steps this should:
 * 1. Migrate pricingModel: prices, products, (eventually discounts) [x]
 * 2. Migrate customers: customers [x], payment methods [x]
 * 3. Migrate subscriptions:
 *    - Subscriptions [ ]
 *    - Subscription items (eventually with discount redemptions) [ ]
 *    - Subscription default payment method [ ]
 * @param db
 */
async function migrateStripeAccountToFlowglad(
  db: PostgresJsDatabase
) {
  // Get the stripe key from command line arguments
  const args = process.argv.slice(2)
  const connectedAccountIdArg = args.find((arg) =>
    arg.startsWith('connected_account_id=')
  )
  if (!connectedAccountIdArg) {
    console.error('Error: connected_account_id argument is required')
    console.error(
      'Usage: NODE_ENV=production pnpm tsx src/scripts/migrateStripeAccountToFlowglad.ts connected_account_id=acct_...'
    )
    process.exit(1)
  }
  const stripeAccountId = connectedAccountIdArg.split('=')[1]

  await db.transaction(
    async (transaction) => {
      const [organization] = await selectOrganizations(
        {
          stripeAccountId,
        },
        transaction
      )
      if (!organization) {
        console.error('Error: organization not found')
        process.exit(1)
      }
    }
  )
}

runScript(migrateStripeAccountToFlowglad)
