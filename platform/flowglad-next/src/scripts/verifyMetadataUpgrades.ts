/* 
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/verifyMetadataUpgrades.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { selectCheckoutSessions } from '@/db/tableMethods/checkoutSessionMethods'
import {
  checkoutSessions,
  checkoutSessionsSelectSchema,
} from '@/db/schema/checkoutSessions'
import { subscriptionsSelectSchema } from '@/db/schema/subscriptions'
import { selectSubscriptions } from '@/db/tableMethods/subscriptionMethods'
import { isNotNull } from 'drizzle-orm'
import { paymentMethods } from '@/db/schema/paymentMethods'
import { paymentMethodsSelectSchema } from '@/db/schema/paymentMethods'
import {
  usageCredits,
  usageCreditsSelectSchema,
} from '@/db/schema/usageCredits'
import {
  subscriptionItems,
  subscriptionItemsSelectSchema,
} from '@/db/schema/subscriptionItems'
import { metadataSchema } from '@/db/tableUtils'

async function verifyMetadataUpgrades(db: PostgresJsDatabase) {
  await db.transaction(async (tx) => {
    // ---- Checkout Sessions ----
    const checkoutSessionMetadata = await db
      .select({
        id: checkoutSessions.id,
        outputMetadata: checkoutSessions.outputMetadata,
      })
      .from(checkoutSessions)
      .where(isNotNull(checkoutSessions.outputMetadata))

    let checkoutSessionErrors = 0
    checkoutSessionMetadata.forEach((checkoutSession) => {
      const result = metadataSchema.safeParse(
        checkoutSession.outputMetadata
      )
      if (!result.success) {
        checkoutSessionErrors++
        console.log(
          `Error parsing checkout session ${checkoutSession.id}: ${result.error.issues}`
        )
      }
    })
    if (
      checkoutSessionMetadata.length > 0 &&
      checkoutSessionErrors === 0
    ) {
      console.log(
        'All checkout session metadata parsed successfully.'
      )
    }

    // ---- Payment Methods ----
    const paymentMethodMetadata = await db
      .select({
        id: paymentMethods.id,
        metadata: paymentMethods.metadata,
      })
      .from(paymentMethods)
      .where(isNotNull(paymentMethods.metadata))

    let paymentMethodErrors = 0
    paymentMethodMetadata.forEach((paymentMethod) => {
      const result = metadataSchema.safeParse(paymentMethod.metadata)
      if (!result.success) {
        paymentMethodErrors++
        console.log(
          `Error parsing payment method ${paymentMethod.id}: ${result.error.issues}`
        )
      }
    })
    if (
      paymentMethodMetadata.length > 0 &&
      paymentMethodErrors === 0
    ) {
      console.log('All payment method metadata parsed successfully.')
    }

    // ---- Usage Credits ----
    const usageCreditMetadata = await db
      .select({
        id: usageCredits.id,
        metadata: usageCredits.metadata,
      })
      .from(usageCredits)
      .where(isNotNull(usageCredits.metadata))

    let usageCreditErrors = 0
    usageCreditMetadata.forEach((usageCredit) => {
      const result = metadataSchema.safeParse(usageCredit.metadata)
      if (!result.success) {
        usageCreditErrors++
        console.log(
          `Error parsing usage credit ${usageCredit.id}: ${result.error.issues}`
        )
      }
    })
    if (usageCreditMetadata.length > 0 && usageCreditErrors === 0) {
      console.log('All usage credit metadata parsed successfully.')
    }

    // ---- Subscription Items ----
    const subscriptionItemMetadata = await db
      .select({
        id: subscriptionItems.id,
        metadata: subscriptionItems.metadata,
      })
      .from(subscriptionItems)
      .where(isNotNull(subscriptionItems.metadata))

    let subscriptionItemErrors = 0
    subscriptionItemMetadata.forEach((subscriptionItem) => {
      const result = metadataSchema.safeParse(
        subscriptionItem.metadata
      )
      if (!result.success) {
        subscriptionItemErrors++
        console.log(
          `Error parsing subscription item ${subscriptionItem.id}: ${result.error.issues}`
        )
      }
    })
    if (
      subscriptionItemMetadata.length > 0 &&
      subscriptionItemErrors === 0
    ) {
      console.log(
        'All subscription item metadata parsed successfully.'
      )
    }
  })
}

runScript(verifyMetadataUpgrades)
