/* eslint-disable no-console */
/* 
run the following in the terminal
NODE_ENV=production bunx tsx src/scripts/verifyMetadataUpgrades.ts
*/

import { checkoutSessions } from '@db-core/schema/checkoutSessions'
import { billingAddressSchema } from '@db-core/schema/organizations'
import { paymentMethods } from '@db-core/schema/paymentMethods'
import { purchases } from '@db-core/schema/purchases'
import { subscriptionItems } from '@db-core/schema/subscriptionItems'
import { usageCredits } from '@db-core/schema/usageCredits'
import { metadataSchema } from '@db-core/tableUtils'
import { isNotNull } from 'drizzle-orm'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { z } from 'zod'
import runScript from './scriptRunner'

async function verifyMetadataUpgrades(db: PostgresJsDatabase) {
  const purchasesMetadata = await db
    .select({
      id: purchases.id,
      metadata: purchases.metadata,
      billingAddress: purchases.billingAddress,
    })
    .from(purchases)
  let purchasesErrors = 0
  purchasesMetadata.forEach((purchase) => {
    const result = metadataSchema
      .nullable()
      .optional()
      .safeParse(purchase.metadata)
    if (!result.success) {
      purchasesErrors++
      console.log(
        `Error parsing purchase metadata ${purchase.id}: ${z.treeifyError(result.error).errors.join(', ')}`
      )
      if (purchase.billingAddress) {
        const result = billingAddressSchema
          .nullable()
          .optional()
          .safeParse(purchase.billingAddress)
        if (!result.success) {
          purchasesErrors++
          console.log(
            `Error parsing purchase billing address ${purchase.id}: ${result.error.issues.join(', ')}`
          )
        }
      }
    }
  })

  if (purchasesMetadata.length > 0 && purchasesErrors === 0) {
    console.log('✅✅✅ All purchases metadata parsed successfully.')
  }

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
      '✅✅✅ All checkout session metadata parsed successfully.'
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
  if (paymentMethodMetadata.length > 0 && paymentMethodErrors === 0) {
    console.log(
      '✅✅✅ All payment method metadata parsed successfully.'
    )
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
    console.log(
      '✅✅✅ All usage credit metadata parsed successfully.'
    )
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
    const result = metadataSchema.safeParse(subscriptionItem.metadata)
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
      '✅✅✅ All subscription item metadata parsed successfully.'
    )
  }
}

runScript(verifyMetadataUpgrades)
