/**
 * Seed script for creating usage events on the Flowglad staging database.
 *
 * This script creates usage events for a specific subscription, customer, and usage meter
 * spread over the past 30 days.
 *
 * Usage:
 *   bunx tsx src/scripts/seedStagingUsageEvents.ts --skip-env-pull
 *
 * The script connects to the staging database and creates usage events
 * for the specified entities.
 */

import { execSync } from 'child_process'
import { eq } from 'drizzle-orm'
import {
  drizzle,
  type PostgresJsDatabase,
} from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { customers } from '@/db/schema/customers'
import { prices } from '@/db/schema/prices'
import { subscriptions } from '@/db/schema/subscriptions'
import { usageEvents } from '@/db/schema/usageEvents'
import { usageMeters } from '@/db/schema/usageMeters'
import core from '@/utils/core'

// Set git commit SHA environment variable (required for database inserts)
const gitCommitSha = execSync('git rev-parse HEAD').toString().trim()
process.env.VERCEL_GIT_COMMIT_SHA = gitCommitSha
console.log(`🔍 Set VERCEL_GIT_COMMIT_SHA to ${gitCommitSha}`)

// Target entities from staging
const TARGET_SUBSCRIPTION_ID = 'sub_mprKk7U9eF4oXnBsOzyTA'
const TARGET_CUSTOMER_ID = 'cust_TYTVQYeOlHIWULwPDadeh'
const TARGET_PRODUCT_ID = 'prod_U38x1QgY5nVWnBxcP7SQO'
const TARGET_USAGE_METER_ID = 'usage_meter_aRrjnyVo51ih8RnObMGih'

// Staging database connection string
const STAGING_DATABASE_URL =
  'postgresql://postgres.nivnpihuzkqkliomklug:vdOK6mIs39rm80H6@aws-0-us-east-1.pooler.supabase.com:6543/postgres'

// Test data identifier prefix for easy cleanup
const TEST_DATA_PREFIX = 'staging_usage_seed_'

async function seedStagingUsageEvents() {
  console.log('\n🌱 Starting Staging Usage Events Seeding...\n')

  // Connect to staging database
  console.log('📦 Connecting to staging database...')
  const client = postgres(STAGING_DATABASE_URL)
  const db = drizzle(client, { logger: true })

  try {
    // Verify subscription exists and get its data
    console.log(
      `\n🔍 Looking up subscription: ${TARGET_SUBSCRIPTION_ID}`
    )
    const [subscription] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.id, TARGET_SUBSCRIPTION_ID))

    if (!subscription) {
      console.error('❌ Subscription not found!')
      process.exit(1)
    }
    console.log(`   ✅ Found subscription: ${subscription.id}`)
    console.log(`   - Customer ID: ${subscription.customerId}`)
    console.log(`   - Livemode: ${subscription.livemode}`)
    console.log(`   - Status: ${subscription.status}`)

    // Verify customer matches
    if (subscription.customerId !== TARGET_CUSTOMER_ID) {
      console.warn(
        `⚠️  Subscription customer (${subscription.customerId}) doesn't match target customer (${TARGET_CUSTOMER_ID})`
      )
      console.log('   Using subscription customer ID for events.')
    }

    // Verify customer exists
    console.log(`\n🔍 Looking up customer: ${TARGET_CUSTOMER_ID}`)
    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, TARGET_CUSTOMER_ID))

    if (!customer) {
      console.error('❌ Customer not found!')
      process.exit(1)
    }
    console.log(`   ✅ Found customer: ${customer.email}`)

    // Verify usage meter exists and get its data
    console.log(
      `\n🔍 Looking up usage meter: ${TARGET_USAGE_METER_ID}`
    )
    const [usageMeter] = await db
      .select()
      .from(usageMeters)
      .where(eq(usageMeters.id, TARGET_USAGE_METER_ID))

    if (!usageMeter) {
      console.error('❌ Usage meter not found!')
      process.exit(1)
    }
    console.log(`   ✅ Found usage meter: ${usageMeter.name}`)
    console.log(
      `   - Aggregation Type: ${usageMeter.aggregationType}`
    )
    console.log(`   - Pricing Model ID: ${usageMeter.pricingModelId}`)

    // Look up active billing period for the subscription (optional)
    console.log(
      `\n🔍 Looking up active billing period for subscription...`
    )
    const [activeBillingPeriod] = await db
      .select()
      .from(billingPeriods)
      .where(
        eq(billingPeriods.subscriptionId, TARGET_SUBSCRIPTION_ID)
      )

    if (activeBillingPeriod) {
      console.log(
        `   ✅ Found billing period: ${activeBillingPeriod.id}`
      )
      console.log(
        `   - Start: ${new Date(activeBillingPeriod.startDate).toISOString()}`
      )
      console.log(
        `   - End: ${new Date(activeBillingPeriod.endDate).toISOString()}`
      )
    } else {
      console.log(
        '   ⚠️  No active billing period found (events will not be assigned to a period)'
      )
    }

    // Look for a price associated with this usage meter
    console.log(`\n🔍 Looking up price for usage meter...`)
    const [usagePrice] = await db
      .select()
      .from(prices)
      .where(eq(prices.usageMeterId, TARGET_USAGE_METER_ID))

    if (usagePrice) {
      console.log(`   ✅ Found price: ${usagePrice.name}`)
      console.log(`   - Price ID: ${usagePrice.id}`)
    } else {
      console.log(
        '   ⚠️  No price found for usage meter (events will not have a priceId)'
      )
    }

    // Generate usage events for the past 30 days
    console.log(
      '\n📈 Generating usage events for the past 30 days...'
    )

    const now = Date.now()
    const dayInMs = 24 * 60 * 60 * 1000
    let totalEventsCreated = 0

    for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
      const date = now - daysAgo * dayInMs
      // Generate 1-5 events per day with varying amounts
      const eventsPerDay = Math.floor(Math.random() * 5) + 1

      for (let i = 0; i < eventsPerDay; i++) {
        const amount = Math.floor(Math.random() * 500) + 50 // 50-550 usage units
        const eventTime = date + Math.floor(Math.random() * dayInMs)
        const transactionId = `${TEST_DATA_PREFIX}${daysAgo}_${i}_${core.nanoid(8)}`

        await db.insert(usageEvents).values({
          id: `usage_event_${core.nanoid()}`,
          customerId: TARGET_CUSTOMER_ID,
          subscriptionId: TARGET_SUBSCRIPTION_ID,
          usageMeterId: TARGET_USAGE_METER_ID,
          amount,
          usageDate: new Date(eventTime),
          transactionId,
          priceId: usagePrice?.id ?? null,
          billingPeriodId: activeBillingPeriod?.id ?? null,
          properties: {},
          pricingModelId: usageMeter.pricingModelId,
          livemode: subscription.livemode,
        })

        totalEventsCreated++
      }
    }

    console.log(`   ✅ Created ${totalEventsCreated} usage events`)

    console.log('\n✨ Staging usage events seeding complete!')
    console.log('\n📋 Summary:')
    console.log(`   - Subscription: ${TARGET_SUBSCRIPTION_ID}`)
    console.log(`   - Customer: ${TARGET_CUSTOMER_ID}`)
    console.log(
      `   - Usage Meter: ${usageMeter.name} (${TARGET_USAGE_METER_ID})`
    )
    console.log(`   - Total Events: ${totalEventsCreated}`)
    console.log(`   - Transaction ID Prefix: ${TEST_DATA_PREFIX}`)
    console.log(
      '\n🧹 To clean up these events later, you can delete by transaction_id prefix:'
    )
    console.log(
      `   DELETE FROM usage_events WHERE transaction_id LIKE '${TEST_DATA_PREFIX}%';`
    )
  } catch (error) {
    console.error('❌ Error seeding usage events:', error)
    throw error
  } finally {
    await client.end()
  }
}

// Run the script
seedStagingUsageEvents()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })
