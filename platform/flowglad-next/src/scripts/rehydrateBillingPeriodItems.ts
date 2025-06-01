/* 
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/rehydrateBillingPeriodItems.ts billing_period_id=bp_...
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import runScript from './scriptRunner'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { attemptToCreateFutureBillingPeriodForSubscription } from '@/subscriptions/billingPeriodHelpers'

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
    const subscription = await selectSubscriptionById(
      billingPeriod.subscriptionId,
      transaction
    )
    const result =
      await attemptToCreateFutureBillingPeriodForSubscription(
        subscription,
        transaction
      )
    console.log(`====result`, result)
  })
}

runScript(rehydrateBillingPeriodItems)
