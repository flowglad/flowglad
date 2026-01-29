/* eslint-disable no-console */
/*
Run the script using the following command:
NODE_ENV=production bunx tsx src/scripts/migrateSingleSubscriptionBillingPeriod.ts stripe_subscription_id=sub_...
*/

import { Customer } from '@db-core/schema/customers'
import { PaymentMethod } from '@db-core/schema/paymentMethods'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type Stripe from 'stripe'
import { selectBillingPeriods } from '@/db/tableMethods/billingPeriodMethods'
import { selectCustomerById } from '@/db/tableMethods/customerMethods'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { selectPaymentMethods } from '@/db/tableMethods/paymentMethodMethods'
import { selectPrices } from '@/db/tableMethods/priceMethods'
import { selectCurrentlyActiveSubscriptionItems } from '@/db/tableMethods/subscriptionItemMethods'
import {
  isSubscriptionInTerminalState,
  selectSubscriptions,
  updateSubscription,
} from '@/db/tableMethods/subscriptionMethods'
import type { DbTransaction } from '@/db/types'
import { stripeSubscriptionToSubscriptionInsert } from '@/migration-helpers/stripeMigrations'
import { createBillingPeriodAndItems } from '@/subscriptions/billingPeriodHelpers'
import { stripe, stripeIdFromObjectOrId } from '@/utils/stripe'
import runScript from './scriptRunner'

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
  let [subscription] = await selectSubscriptions(
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

  console.log(
    `Merging latest Stripe subscription state into Flowglad subscription ${subscription.id}`
  )

  const stripeSubscriptionForUpdate =
    await stripe.subscriptions.retrieve(
      stripeSubscriptionId,
      {
        expand: ['default_payment_method', 'items'],
      },
      {
        stripeAccount: stripeAccountId,
      }
    )

  const customer = (
    await selectCustomerById(subscription.customerId, transaction)
  ).unwrap()

  const paymentMethods = await selectPaymentMethods(
    { customerId: customer.id },
    transaction
  )

  const stripePriceId =
    stripeSubscriptionForUpdate.items.data[0].price.id
  const [price] = await selectPrices(
    { externalId: stripePriceId },
    transaction
  )
  if (!price) {
    throw new Error(
      `Could not find a Flowglad price for Stripe price ${stripePriceId}`
    )
  }

  const subscriptionUpdatePayload =
    await stripeSubscriptionToSubscriptionInsert(
      stripeSubscriptionForUpdate,
      customer,
      paymentMethods,
      price,
      {
        organizationId: flowgladOrganizationId,
        livemode: true,
        pricingModelId: customer.pricingModelId,
      },
      stripe
    )

  const updatedSubscription = await updateSubscription(
    { id: subscription.id, ...subscriptionUpdatePayload },
    transaction
  )

  subscription = updatedSubscription

  console.log(
    `Successfully merged Stripe state into Flowglad subscription ${subscription.id}`
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

  if (subscription.renews === false) {
    throw new Error(
      `Subscription ${subscription.id} is a non-renewing subscription (this should never happen). All stripe subscriptions should renew when migrated to Flowglad`
    )
  }

  // Create the initial billing period
  const { billingPeriod, billingPeriodItems } = (
    await createBillingPeriodAndItems(
      {
        subscription,
        subscriptionItems,
        trialPeriod: false,
        isInitialBillingPeriod: true,
      },
      transaction
    )
  ).unwrap()

  console.log(
    `Created billing period ${billingPeriod.id} for subscription ${subscription.id}`
  )

  // Calculate total charge from billing period items
  const totalCharge = billingPeriodItems.reduce((total, item) => {
    return total + item.unitPrice * item.quantity
  }, 0)

  console.log(`Billing period details:
    Start date: ${new Date(billingPeriod.startDate).toISOString()}
    End date: ${new Date(billingPeriod.endDate).toISOString()}
    Total charge: ${totalCharge / 100} (in cents: ${totalCharge})
    Items: ${billingPeriodItems
      .map(
        (item) =>
          `\n      - ${item.name}: ${item.quantity} x ${item.unitPrice / 100} = ${(item.quantity * item.unitPrice) / 100}`
      )
      .join('')}
  `)

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
      'Usage: NODE_ENV=production bunx tsx src/scripts/migrateSingleSubscriptionBillingPeriod.ts stripe_subscription_id=sub_...'
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
    const organization = (
      await selectOrganizationById(
        subscription.organizationId,
        transaction
      )
    ).unwrap()

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
