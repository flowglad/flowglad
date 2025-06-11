/* eslint-disable no-console */
/*
Run the script using the following command:
NODE_ENV=production pnpm tsx src/scripts/migrateSingleSubscriptionBillingPeriod.ts stripe_subscription_id=sub_...
*/
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { stripe, stripeIdFromObjectOrId } from '@/utils/stripe'
import {
  isSubscriptionInTerminalState,
  selectSubscriptions,
} from '@/db/tableMethods/subscriptionMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectCurrentlyActiveSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import { selectBillingPeriods } from '@/db/tableMethods/billingPeriodMethods'
import { createBillingPeriodAndItems } from '@/subscriptions/billingPeriodHelpers'
import type { DbTransaction } from '@/db/types'
import Stripe from 'stripe'

/**
 * Migrates a single subscription's billing period from Stripe to Flowglad
 * and pauses the subscription in Stripe.
 *
 * @param params Parameters for the migration
 * @returns Result of the migration
 */
export const migrateSingleSubscriptionBillingPeriod = async (
  params: {
    stripeSubscriptionId: string
    stripeAccountId: string
    stripe: Stripe
    flowgladOrganizationId: string
  },
  transaction: DbTransaction
) => {
  const {
    stripeSubscriptionId,
    stripeAccountId,
    stripe,
    flowgladOrganizationId,
  } = params

  console.log(
    `Starting migration for Stripe subscription ${stripeSubscriptionId}`
  )

  // Get the Stripe subscription details
  // const stripeSubscription =
  //   await stripeClient.subscriptions.retrieve(
  //     stripeSubscriptionId,
  //     {
  //       expand: ['default_payment_method', 'items'],
  //     },
  //     {
  //       stripeAccount: stripeAccountId,
  //     }
  //   )

  // Process the subscription in a transaction
  // Find the corresponding Flowglad subscription
  const [subscription] = await selectSubscriptions(
    {
      externalId: stripeIdFromObjectOrId(stripeSubscriptionId),
      organizationId: flowgladOrganizationId,
      livemode: true,
    },
    transaction
  )

  if (!subscription) {
    throw new Error(
      `No Flowglad subscription found for Stripe subscription ${stripeSubscriptionId}`
    )
  }

  console.log(
    `Found Flowglad subscription ${subscription.id} for Stripe subscription ${stripeSubscriptionId}`
  )

  // Skip subscriptions that are already in a terminal state
  if (isSubscriptionInTerminalState(subscription.status)) {
    console.log(
      `Skipping subscription ${subscription.id} as it's in a terminal state: ${subscription.status}`
    )
    return {
      success: false,
      reason: 'subscription_in_terminal_state',
      status: subscription.status,
      stripeSubscriptionId,
      flowgladSubscriptionId: subscription.id,
      flowgladCustomerId: subscription.customerId,
    }
  }

  // Skip subscriptions without a payment method
  if (
    !subscription.defaultPaymentMethodId &&
    !subscription.backupPaymentMethodId
  ) {
    console.log(
      `Skipping subscription ${subscription.id} as it has no payment method`
    )
    return {
      success: false,
      reason: 'no_payment_method',
      subscriptionId: subscription.id,
      flowgladSubscriptionId: subscription.id,
      flowgladCustomerId: subscription.customerId,
    }
  }

  // Get subscription items for this subscription
  const subscriptionItems =
    await selectCurrentlyActiveSubscriptionItems(
      { subscriptionId: subscription.id },
      new Date(),
      transaction
    )

  if (subscriptionItems.length === 0) {
    console.log(
      `Skipping subscription ${subscription.id} as it has no subscription items`
    )
    return {
      success: false,
      reason: 'no_subscription_items',
      subscriptionId: subscription.id,
      flowgladSubscriptionId: subscription.id,
      flowgladCustomerId: subscription.customerId,
    }
  }

  // Check if a billing period already exists
  const existingBillingPeriods = await selectBillingPeriods(
    { subscriptionId: subscription.id },
    transaction
  )

  if (existingBillingPeriods.length > 0) {
    console.log(
      `Subscription ${subscription.id} already has ${existingBillingPeriods.length} billing periods`
    )
    return {
      success: false,
      reason: 'billing_periods_exist',
      subscriptionId: subscription.id,
      billingPeriodCount: existingBillingPeriods.length,
      flowgladSubscriptionId: subscription.id,
      flowgladCustomerId: subscription.customerId,
    }
  }

  // Create the initial billing period
  const { billingPeriod } = await createBillingPeriodAndItems(
    {
      subscription,
      subscriptionItems,
      trialPeriod: false,
      isInitialBillingPeriod: true,
    },
    transaction
  )

  console.log(
    `Created billing period ${billingPeriod.id} for subscription ${subscription.id}`
  )
  const stripeSubscription = await stripe.subscriptions.retrieve(
    stripeSubscriptionId,
    {
      stripeAccount: stripeAccountId,
    }
  )

  // Pause the subscription in Stripe
  await stripe.subscriptions.update(
    stripeSubscriptionId,
    {
      pause_collection: {
        behavior: 'void', // This prevents Stripe from collecting any payments
        resumes_at: undefined, // No automatic resumption
      },
      metadata: {
        ...stripeSubscription.metadata,
        migrated_to_flowglad_time_ms: Date.now(),
      },
    },
    {
      stripeAccount: stripeAccountId,
    }
  )

  console.log(`Paused Stripe subscription ${stripeSubscriptionId}`)

  return {
    success: true,
    subscriptionId: subscription.id,
    billingPeriodId: billingPeriod.id,
    stripeSubscriptionId,
    flowgladSubscriptionId: subscription.id,
    flowgladCustomerId: subscription.customerId,
  }
}

/**
 * Migrates a single subscription's billing period from Stripe to Flowglad
 *
 * @param db Database connection
 */
async function migrateSingleSubscriptionBillingPeriodScript(
  db: PostgresJsDatabase
) {
  // Get the stripe subscription ID from command line arguments
  const args = process.argv.slice(2)
  const stripeSubscriptionIdArg = args.find((arg) =>
    arg.startsWith('stripe_subscription_id=')
  )

  if (!stripeSubscriptionIdArg) {
    console.error(
      'Error: stripe_subscription_id argument is required'
    )
    console.error(
      'Usage: NODE_ENV=production pnpm tsx src/scripts/migrateSingleSubscriptionBillingPeriod.ts stripe_subscription_id=sub_...'
    )
    process.exit(1)
  }

  const stripeSubscriptionId = stripeSubscriptionIdArg.split('=')[1]
  const stripeClient = stripe(true)

  console.log(
    `Starting migration for Stripe subscription ${stripeSubscriptionId}`
  )

  // Process the subscription in a transaction
  await db.transaction(async (transaction) => {
    // Find the corresponding Flowglad subscription
    const [subscription] = await selectSubscriptions(
      {
        externalId: stripeIdFromObjectOrId(stripeSubscriptionId),
        livemode: true,
      },
      transaction
    )

    if (!subscription) {
      throw new Error(
        `No Flowglad subscription found for Stripe subscription ${stripeSubscriptionId}`
      )
    }

    console.log(
      `Found Flowglad subscription ${subscription.id} for Stripe subscription ${stripeSubscriptionId}`
    )

    // Get the organization for this subscription
    const organization = await selectOrganizationById(
      subscription.organizationId,
      transaction
    )

    if (!organization) {
      throw new Error(
        `No organization found for subscription ${subscription.id}`
      )
    }

    console.log(
      `Found organization ${organization.id} for subscription ${subscription.id}`
    )

    if (!organization.stripeAccountId) {
      throw new Error(
        `Organization ${organization.id} has no Stripe account ID`
      )
    }

    // Migrate the subscription billing period
    const result = await migrateSingleSubscriptionBillingPeriod(
      {
        stripeSubscriptionId,
        stripeAccountId: organization.stripeAccountId,
        stripe: stripeClient,
        flowgladOrganizationId: organization.id,
      },
      transaction
    )

    console.log('Migration result:', result)
  })
}

runScript(migrateSingleSubscriptionBillingPeriodScript)
