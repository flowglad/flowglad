/**
 * Seed script for testing the Usage Volume Chart feature on the dashboard.
 *
 * This script creates:
 * - A usage meter with Sum aggregation type
 * - A usage meter with CountDistinctProperties aggregation type
 * - Usage events spread over the past 30 days for both meters
 *
 * Usage:
 *   bunx tsx src/scripts/seedUsageVolumeTestData.ts --skip-env-pull
 *
 * The script will prompt for the organization ID if not provided as an environment variable.
 * You can find your organization ID in the dashboard URL or by checking your local database.
 *
 * To remove the test data later, run:
 *   bunx tsx src/scripts/cleanupUsageVolumeTestData.ts --skip-env-pull
 */

import { eq } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as readline from 'readline'
import { adminTransaction } from '@/db/adminTransaction'
import { customers } from '@/db/schema/customers'
import { usageEvents } from '@/db/schema/usageEvents'
import { usageMeters } from '@/db/schema/usageMeters'
import { selectDefaultPricingModel } from '@/db/tableMethods/pricingModelMethods'
import {
  IntervalUnit,
  PriceType,
  UsageMeterAggregationType,
} from '@/types'
import core from '@/utils/core'
import {
  setupCustomer,
  setupPaymentMethod,
  setupPrice,
  setupSubscription,
  setupUsageEvent,
  setupUsageMeter,
} from '../../seedDatabase'
import runScript from './scriptRunner'

// Test data identifiers (for cleanup)
const TEST_DATA_PREFIX = 'usage_volume_test_'
const SUM_METER_NAME = `${TEST_DATA_PREFIX}API Calls`
const DISTINCT_METER_NAME = `${TEST_DATA_PREFIX}Active Users`

async function promptForOrgId(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    console.log('\n📋 To find your organization ID:')
    console.log(
      '   1. Go to your local dashboard (http://localhost:3000/)'
    )
    console.log('   2. The org ID is in the URL after /dashboard/')
    console.log(
      '   3. Or check the browser dev tools Network tab for API calls\n'
    )

    rl.question('Enter your organization ID: ', (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function seedUsageVolumeTestData(db: PostgresJsDatabase) {
  console.log(
    '\n🌱 Starting Usage Volume Chart Test Data Seeding...\n'
  )

  // Get organization ID from environment or prompt
  let organizationId = process.env.TEST_ORG_ID

  if (!organizationId) {
    organizationId = await promptForOrgId()
  }

  if (!organizationId || organizationId.length < 5) {
    console.error('❌ Invalid organization ID provided')
    process.exit(1)
  }

  console.log(`📦 Using organization ID: ${organizationId}`)

  await adminTransaction(async ({ transaction }) => {
    // Check if test data already exists
    const existingMeters = await transaction
      .select()
      .from(usageMeters)
      .where(eq(usageMeters.organizationId, organizationId))

    const hasTestData = existingMeters.some(
      (m) =>
        m.name === SUM_METER_NAME || m.name === DISTINCT_METER_NAME
    )

    if (hasTestData) {
      console.log(
        '⚠️  Test data already exists. Run the cleanup script first if you want to regenerate.'
      )
      console.log(
        '   bunx tsx src/scripts/cleanupUsageVolumeTestData.ts --skip-env-pull'
      )
      return
    }

    // Get the default pricing model for livemode
    const pricingModel = await selectDefaultPricingModel(
      { organizationId, livemode: true },
      transaction
    )

    if (!pricingModel) {
      console.error(
        '❌ No default pricing model found for this organization in livemode'
      )
      console.log(
        '   Make sure you have set up your organization properly.'
      )
      process.exit(1)
    }

    console.log(`📦 Using pricing model: ${pricingModel.name}`)

    // Check for existing customer
    const existingCustomers = await transaction
      .select()
      .from(customers)
      .where(eq(customers.organizationId, organizationId))

    let customerId: string
    let subscriptionId: string

    if (existingCustomers.length > 0) {
      // Use existing customer
      customerId = existingCustomers[0].id
      console.log(
        `👤 Using existing customer: ${existingCustomers[0].email}`
      )

      // We need a subscription to create usage events
      // For simplicity, we'll create test-specific resources
    }

    // Create a test customer for usage events
    console.log('\n📝 Creating test customer...')
    const testCustomer = await setupCustomer({
      organizationId,
      email: `${TEST_DATA_PREFIX}customer@test.flowglad.com`,
      name: 'Usage Volume Test Customer',
      livemode: true,
      pricingModelId: pricingModel.id,
    })
    customerId = testCustomer.id
    console.log(`   ✅ Created test customer: ${testCustomer.email}`)

    // Create payment method
    const paymentMethod = await setupPaymentMethod({
      organizationId,
      customerId,
      livemode: true,
    })
    console.log(`   ✅ Created payment method`)

    // Create usage meters
    console.log('\n📊 Creating usage meters...')

    // 1. Sum aggregation meter (API Calls)
    const sumMeter = await setupUsageMeter({
      organizationId,
      name: SUM_METER_NAME,
      livemode: true,
      pricingModelId: pricingModel.id,
      slug: `${TEST_DATA_PREFIX}api-calls-${core.nanoid(6)}`,
      aggregationType: UsageMeterAggregationType.Sum,
    })
    console.log(`   ✅ Created Sum meter: "${sumMeter.name}"`)

    // 2. CountDistinctProperties aggregation meter (Active Users)
    const distinctMeter = await setupUsageMeter({
      organizationId,
      name: DISTINCT_METER_NAME,
      livemode: true,
      pricingModelId: pricingModel.id,
      slug: `${TEST_DATA_PREFIX}active-users-${core.nanoid(6)}`,
      aggregationType:
        UsageMeterAggregationType.CountDistinctProperties,
    })
    console.log(
      `   ✅ Created CountDistinctProperties meter: "${distinctMeter.name}"`
    )

    // Create a usage price for the subscription
    // First we need a product - let's check if there's a default one
    const { selectProducts } = await import(
      '@/db/tableMethods/productMethods'
    )
    const productsResult = await selectProducts(
      { organizationId, livemode: true },
      transaction
    )

    let productId: string
    if (productsResult.length > 0) {
      productId = productsResult[0].id
      console.log(
        `\n📦 Using existing product: ${productsResult[0].name}`
      )
    } else {
      const { setupProduct } = await import('../../seedDatabase')
      const product = await setupProduct({
        organizationId,
        name: `${TEST_DATA_PREFIX}Product`,
        livemode: true,
        pricingModelId: pricingModel.id,
      })
      productId = product.id
      console.log(`   ✅ Created test product`)
    }

    // Create a price for subscriptions
    const price = await setupPrice({
      productId,
      name: `${TEST_DATA_PREFIX}Usage Price`,
      type: PriceType.Usage,
      unitPrice: 100, // $0.01 per unit
      livemode: true,
      isDefault: false,
      usageMeterId: sumMeter.id,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })
    console.log(`   ✅ Created usage price`)

    // Create subscription
    const subscription = await setupSubscription({
      organizationId,
      customerId,
      paymentMethodId: paymentMethod.id,
      priceId: price.id,
      livemode: true,
    })
    subscriptionId = subscription.id
    console.log(`   ✅ Created subscription`)

    // Generate usage events for the past 30 days
    console.log(
      '\n📈 Generating usage events for the past 30 days...'
    )

    const now = Date.now()
    const dayInMs = 24 * 60 * 60 * 1000

    // Generate Sum meter events (API Calls - varying amounts)
    console.log(`   Generating events for "${SUM_METER_NAME}"...`)
    for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
      const date = now - daysAgo * dayInMs
      // Generate 1-5 events per day with varying amounts
      const eventsPerDay = Math.floor(Math.random() * 5) + 1

      for (let i = 0; i < eventsPerDay; i++) {
        const amount = Math.floor(Math.random() * 500) + 50 // 50-550 API calls
        const eventTime = date + Math.floor(Math.random() * dayInMs)

        await setupUsageEvent({
          organizationId,
          subscriptionId,
          usageMeterId: sumMeter.id,
          amount,
          priceId: price.id,
          transactionId: `${TEST_DATA_PREFIX}sum_${daysAgo}_${i}_${core.nanoid(8)}`,
          customerId,
          livemode: true,
          usageDate: eventTime,
          pricingModelId: pricingModel.id,
          properties: {},
        })
      }
    }
    console.log(`   ✅ Created ~120 Sum meter events`)

    // Create a second price for the distinct meter
    const distinctPrice = await setupPrice({
      productId,
      name: `${TEST_DATA_PREFIX}Active Users Price`,
      type: PriceType.Usage,
      unitPrice: 500, // $5.00 per active user
      livemode: true,
      isDefault: false,
      usageMeterId: distinctMeter.id,
      intervalUnit: IntervalUnit.Month,
      intervalCount: 1,
    })

    // Generate CountDistinctProperties meter events (Active Users)
    console.log(
      `   Generating events for "${DISTINCT_METER_NAME}"...`
    )
    const userIds = [
      'user_alice',
      'user_bob',
      'user_charlie',
      'user_diana',
      'user_eve',
      'user_frank',
      'user_grace',
      'user_henry',
      'user_ivy',
      'user_jack',
    ]

    for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
      const date = now - daysAgo * dayInMs
      // Randomly select 3-8 active users per day
      const activeUsersCount = Math.floor(Math.random() * 6) + 3
      const shuffledUsers = [...userIds].sort(
        () => Math.random() - 0.5
      )
      const activeUsers = shuffledUsers.slice(0, activeUsersCount)

      for (const userId of activeUsers) {
        // Each active user might have 1-3 events per day
        const eventsPerUser = Math.floor(Math.random() * 3) + 1

        for (let i = 0; i < eventsPerUser; i++) {
          const eventTime = date + Math.floor(Math.random() * dayInMs)

          await setupUsageEvent({
            organizationId,
            subscriptionId,
            usageMeterId: distinctMeter.id,
            amount: 1, // Amount doesn't matter for CountDistinct
            priceId: distinctPrice.id,
            transactionId: `${TEST_DATA_PREFIX}distinct_${daysAgo}_${userId}_${i}_${core.nanoid(8)}`,
            customerId,
            livemode: true,
            usageDate: eventTime,
            pricingModelId: pricingModel.id,
            properties: {
              userId,
              sessionId: `session_${core.nanoid(6)}`,
            },
          })
        }
      }
    }
    console.log(
      `   ✅ Created ~200 CountDistinctProperties meter events`
    )

    console.log('\n✨ Test data seeding complete!')
    console.log('\n📋 Summary:')
    console.log(`   - Organization: ${organizationId}`)
    console.log(`   - Customer: ${testCustomer.email}`)
    console.log(
      `   - Sum Meter: "${SUM_METER_NAME}" (ID: ${sumMeter.id})`
    )
    console.log(
      `   - Distinct Meter: "${DISTINCT_METER_NAME}" (ID: ${distinctMeter.id})`
    )
    console.log('\n🎯 Next steps:')
    console.log('   1. Go to your dashboard: http://localhost:3000/')
    console.log(
      '   2. Click on the metric dropdown (Revenue/MRR/Subscribers)'
    )
    console.log(
      '   3. You should see a "Usage Meters" section with your test meters'
    )
    console.log('   4. Select a meter to see the usage volume chart!')
    console.log('\n🧹 To clean up test data later:')
    console.log(
      '   bunx tsx src/scripts/cleanupUsageVolumeTestData.ts --skip-env-pull'
    )
  })
}

runScript(seedUsageVolumeTestData)
