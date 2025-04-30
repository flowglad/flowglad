/* eslint-disable no-console */

/* 
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/createRetryBillingRun.ts billing_period_id=billing_period_....
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { createBillingRun } from '@/subscriptions/billingRunHelpers'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'

async function createRetryBillingRun(db: PostgresJsDatabase) {
  const params = process.argv.reduce(
    (acc, arg) => {
      const [key, value] = arg.split('=')
      return { ...acc, [key]: value }
    },
    {} as Record<string, string>
  )

  if (!params.billing_period_id) {
    throw new Error('cli argument `billing_period_id` is required')
  }

  await db.transaction(async (transaction) => {
    const billingPeriod = await selectBillingPeriodById(
      params.billing_period_id,
      transaction
    )
    const subscription = await selectSubscriptionById(
      billingPeriod.subscriptionId,
      transaction
    )
    const paymentMethod = await selectPaymentMethodById(
      subscription.defaultPaymentMethodId!,
      transaction
    )
    const scheduledFor = new Date()
    await createBillingRun(
      {
        billingPeriod: billingPeriod,
        paymentMethod,
        scheduledFor,
      },
      transaction
    )
    console.log(
      `Billing run created for billing period ${params.billing_period_id}, scheduled for ${scheduledFor}`
    )
  })
}

runScript(createRetryBillingRun)
