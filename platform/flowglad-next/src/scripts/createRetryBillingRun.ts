/* eslint-disable no-console */

/* 
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/createRetryBillingRun.ts billing_period_id=billing_period_....
*/

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { selectBillingPeriodById } from '@/db/tableMethods/billingPeriodMethods'
import { selectPaymentMethodById } from '@/db/tableMethods/paymentMethodMethods'
import { selectSubscriptionById } from '@/db/tableMethods/subscriptionMethods'
import { createBillingRun } from '@/subscriptions/billingRunHelpers'
import runScript from './scriptRunner'

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
    const billingPeriod = (
      await selectBillingPeriodById(
        params.billing_period_id,
        transaction
      )
    ).unwrap()
    const subscription = (
      await selectSubscriptionById(
        billingPeriod.subscriptionId,
        transaction
      )
    ).unwrap()
    const paymentMethod = await selectPaymentMethodById(
      subscription.defaultPaymentMethodId!,
      transaction
    )
    const scheduledFor = new Date()
    const billingRunResult = await createBillingRun(
      {
        billingPeriod: billingPeriod,
        paymentMethod,
        scheduledFor,
      },
      transaction
    )
    const billingRun = billingRunResult.unwrap()
    console.log(
      `Billing run created for billing period ${params.billing_period_id}, scheduled for ${scheduledFor},`
    )
    console.log(`Billing run created:`, billingRun)
  })
}

runScript(createRetryBillingRun)
