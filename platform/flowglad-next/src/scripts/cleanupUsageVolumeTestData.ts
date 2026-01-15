/**
 * Cleanup script for removing Usage Volume Chart test data.
 *
 * This script removes:
 * - Usage events with the test data prefix
 * - Usage meters with the test data prefix
 * - Test customer and related records
 *
 * Usage:
 *   bunx tsx src/scripts/cleanupUsageVolumeTestData.ts --skip-env-pull
 */

import { and, eq, like, sql } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import * as readline from 'readline'
import { adminTransaction } from '@/db/adminTransaction'
import { customers } from '@/db/schema/customers'
import { paymentMethods } from '@/db/schema/paymentMethods'
import { prices } from '@/db/schema/prices'
import { subscriptions } from '@/db/schema/subscriptions'
import { usageEvents } from '@/db/schema/usageEvents'
import { usageMeters } from '@/db/schema/usageMeters'
import runScript from './scriptRunner'

const TEST_DATA_PREFIX = 'usage_volume_test_'

async function promptForOrgId(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    rl.question('Enter your organization ID: ', (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function cleanupUsageVolumeTestData(db: PostgresJsDatabase) {
  console.log(
    '\n🧹 Starting Usage Volume Chart Test Data Cleanup...\n'
  )

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
    // Find test usage meters
    const testMeters = await transaction
      .select()
      .from(usageMeters)
      .where(
        and(
          eq(usageMeters.organizationId, organizationId),
          like(usageMeters.name, `${TEST_DATA_PREFIX}%`)
        )
      )

    console.log(`\n📊 Found ${testMeters.length} test usage meters`)

    if (testMeters.length > 0) {
      const meterIds = testMeters.map((m) => m.id)

      // Delete usage events for test meters
      const deletedEvents = await transaction
        .delete(usageEvents)
        .where(
          sql`${usageEvents.usageMeterId} IN (${sql.join(
            meterIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
        .returning({ id: usageEvents.id })

      console.log(
        `   ✅ Deleted ${deletedEvents.length} usage events`
      )

      // Delete prices associated with test meters
      const deletedPrices = await transaction
        .delete(prices)
        .where(
          sql`${prices.usageMeterId} IN (${sql.join(
            meterIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
        .returning({ id: prices.id })

      console.log(`   ✅ Deleted ${deletedPrices.length} prices`)

      // Delete the usage meters
      const deletedMeters = await transaction
        .delete(usageMeters)
        .where(
          sql`${usageMeters.id} IN (${sql.join(
            meterIds.map((id) => sql`${id}`),
            sql`, `
          )})`
        )
        .returning({ id: usageMeters.id })

      console.log(
        `   ✅ Deleted ${deletedMeters.length} usage meters`
      )
    }

    // Find and delete test customer
    const testCustomers = await transaction
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.organizationId, organizationId),
          like(customers.email, `${TEST_DATA_PREFIX}%`)
        )
      )

    console.log(`\n👤 Found ${testCustomers.length} test customers`)

    if (testCustomers.length > 0) {
      for (const customer of testCustomers) {
        // Delete subscriptions for this customer
        const deletedSubs = await transaction
          .delete(subscriptions)
          .where(eq(subscriptions.customerId, customer.id))
          .returning({ id: subscriptions.id })

        console.log(
          `   ✅ Deleted ${deletedSubs.length} subscriptions for customer ${customer.email}`
        )

        // Delete payment methods for this customer
        const deletedPMs = await transaction
          .delete(paymentMethods)
          .where(eq(paymentMethods.customerId, customer.id))
          .returning({ id: paymentMethods.id })

        console.log(
          `   ✅ Deleted ${deletedPMs.length} payment methods for customer ${customer.email}`
        )

        // Delete the customer
        await transaction
          .delete(customers)
          .where(eq(customers.id, customer.id))

        console.log(`   ✅ Deleted customer: ${customer.email}`)
      }
    }

    console.log('\n✨ Cleanup complete!')
    console.log(
      '\n💡 Refresh your dashboard to see the meters removed from the dropdown.'
    )
  })
}

runScript(cleanupUsageVolumeTestData)
