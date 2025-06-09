/* 
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/createNextBillingPeriodForSubscription.ts subscription_id=sub_...
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { attemptToCreateFutureBillingPeriodForSubscription } from '@/subscriptions/billingPeriodHelpers'

async function createNextBillingPeriodForSubscription(
  db: PostgresJsDatabase
) {
  // eslint-disable-next-line no-console
  // Get the stripe subscription ID from command line arguments
  const args = process.argv.slice(2)
  const subscriptionIdArg = args.find((arg) =>
    arg.startsWith('subscription_id=')
  )

  if (!subscriptionIdArg) {
    console.error('Error: billing_period_id argument is required')
    console.error(
      'Usage: NODE_ENV=production pnpm tsx src/scripts/rehydrateBillingPeriodItems.ts billing_period_id=bp_...'
    )
    process.exit(1)
  }

  const subscriptionId = subscriptionIdArg.split('=')[1]
  if (!subscriptionId) {
    throw new Error(
      'Please provide a billing period ID as a command line argument'
    )
  }
  await db.transaction(async (transaction) => {
    const subscription = await selectSubscriptionById(
      subscriptionId,
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

runScript(createNextBillingPeriodForSubscription)
