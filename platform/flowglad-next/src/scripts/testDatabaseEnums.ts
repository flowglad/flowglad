/* testDatabaseEnums script with targeted environment
run the following in the terminal
NODE_ENV=production pnpm tsx src/scripts/testDatabaseEnums.ts
*/

import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import runScript from './scriptRunner'
import { testEnumColumn } from '@/db/tableUtils'
import { payments } from '@/db/schema/payments'
import { events } from '@/db/schema/events'
import { paymentMethods } from '@/db/schema/paymentMethods'
import { subscriptions } from '@/db/schema/subscriptions'
import { purchases } from '@/db/schema/purchases'
import { discounts } from '@/db/schema/discounts'
import { apiKeys } from '@/db/schema/apiKeys'
import { checkoutSessions } from '@/db/schema/checkoutSessions'
import { billingRuns } from '@/db/schema/billingRuns'
import { discountRedemptions } from '@/db/schema/discountRedemptions'
import { purchaseAccessSessions } from '@/db/schema/purchaseAccessSessions'
import { feeCalculations } from '@/db/schema/feeCalculations'
import { organizations } from '@/db/schema/organizations'
import { usageMeters } from '@/db/schema/usageMeters'
import { invoices } from '@/db/schema/invoices'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { prices } from '@/db/schema/prices'
import {
  PaymentMethodType,
  PaymentStatus,
  CurrencyCode,
  FlowgladEventType,
  EventCategory,
  EventRetentionPolicy,
  EventNoun,
  SubscriptionStatus,
  IntervalUnit,
  PurchaseStatus,
  PriceType,
  DiscountAmountType,
  DiscountDuration,
  FlowgladApiKeyType,
  CheckoutSessionStatus,
  CheckoutSessionType,
  BillingRunStatus,
  BillingPeriodStatus,
  PurchaseAccessSessionSource,
  FeeCalculationType,
  BusinessOnboardingStatus,
  StripeConnectContractType,
  UsageMeterAggregationType,
  InvoiceStatus,
  InvoiceType,
} from '@/types'

export async function testDatabaseEnums(db: PostgresJsDatabase) {
  // eslint-disable-next-line no-console
  console.log('Testing database enum columns...')

  // Create a transaction
  await db.transaction(async (tx) => {
    // Payments table
    await testEnumColumn(
      payments,
      payments.paymentMethod,
      PaymentMethodType,
      tx
    )
    await testEnumColumn(
      payments,
      payments.currency,
      CurrencyCode,
      tx
    )
    await testEnumColumn(payments, payments.status, PaymentStatus, tx)

    // Events table
    await testEnumColumn(events, events.type, FlowgladEventType, tx)
    await testEnumColumn(
      events,
      events.eventCategory,
      EventCategory,
      tx
    )
    await testEnumColumn(
      events,
      events.eventRetentionPolicy,
      EventRetentionPolicy,
      tx
    )
    await testEnumColumn(events, events.subjectEntity, EventNoun, tx)
    await testEnumColumn(events, events.objectEntity, EventNoun, tx)

    // PaymentMethods table
    await testEnumColumn(
      paymentMethods,
      paymentMethods.type,
      PaymentMethodType,
      tx
    )

    // Subscriptions table
    await testEnumColumn(
      subscriptions,
      subscriptions.status,
      SubscriptionStatus,
      tx
    )
    await testEnumColumn(
      subscriptions,
      subscriptions.interval,
      IntervalUnit,
      tx
    )

    // Purchases table
    await testEnumColumn(
      purchases,
      purchases.status,
      PurchaseStatus,
      tx
    )
    await testEnumColumn(
      purchases,
      purchases.priceType,
      PriceType,
      tx
    )
    await testEnumColumn(
      purchases,
      purchases.intervalUnit,
      IntervalUnit,
      tx
    )

    // Discounts table
    await testEnumColumn(
      discounts,
      discounts.amountType,
      DiscountAmountType,
      tx
    )
    await testEnumColumn(
      discounts,
      discounts.duration,
      DiscountDuration,
      tx
    )

    // ApiKeys table
    await testEnumColumn(
      apiKeys,
      apiKeys.type,
      FlowgladApiKeyType,
      tx
    )

    // CheckoutSessions table
    await testEnumColumn(
      checkoutSessions,
      checkoutSessions.status,
      CheckoutSessionStatus,
      tx
    )
    await testEnumColumn(
      checkoutSessions,
      checkoutSessions.paymentMethodType,
      PaymentMethodType,
      tx
    )
    await testEnumColumn(
      checkoutSessions,
      checkoutSessions.type,
      CheckoutSessionType,
      tx
    )

    // BillingRuns table
    await testEnumColumn(
      billingRuns,
      billingRuns.status,
      BillingRunStatus,
      tx
    )

    // DiscountRedemptions table
    await testEnumColumn(
      discountRedemptions,
      discountRedemptions.discountAmountType,
      DiscountAmountType,
      tx
    )
    await testEnumColumn(
      discountRedemptions,
      discountRedemptions.duration,
      DiscountDuration,
      tx
    )

    // PurchaseAccessSessions table
    await testEnumColumn(
      purchaseAccessSessions,
      purchaseAccessSessions.source,
      PurchaseAccessSessionSource,
      tx
    )

    // FeeCalculations table
    await testEnumColumn(
      feeCalculations,
      feeCalculations.paymentMethodType,
      PaymentMethodType,
      tx
    )
    await testEnumColumn(
      feeCalculations,
      feeCalculations.currency,
      CurrencyCode,
      tx
    )
    await testEnumColumn(
      feeCalculations,
      feeCalculations.type,
      FeeCalculationType,
      tx
    )

    // Organizations table
    await testEnumColumn(
      organizations,
      organizations.onboardingStatus,
      BusinessOnboardingStatus,
      tx
    )
    await testEnumColumn(
      organizations,
      organizations.defaultCurrency,
      CurrencyCode,
      tx
    )
    await testEnumColumn(
      organizations,
      organizations.stripeConnectContractType,
      StripeConnectContractType,
      tx
    )

    // UsageMeters table
    await testEnumColumn(
      usageMeters,
      usageMeters.aggregationType,
      UsageMeterAggregationType,
      tx
    )

    // Invoices table
    await testEnumColumn(invoices, invoices.status, InvoiceStatus, tx)
    await testEnumColumn(invoices, invoices.type, InvoiceType, tx)
    await testEnumColumn(
      invoices,
      invoices.currency,
      CurrencyCode,
      tx
    )

    // BillingPeriods table
    await testEnumColumn(
      billingPeriods,
      billingPeriods.status,
      BillingPeriodStatus,
      tx
    )

    // Prices table
    await testEnumColumn(
      prices,
      prices.intervalUnit,
      IntervalUnit,
      tx
    )
    await testEnumColumn(prices, prices.type, PriceType, tx)
    await testEnumColumn(prices, prices.currency, CurrencyCode, tx)
    // eslint-disable-next-line no-console
    console.log('All enum columns tested successfully!')
  })
}

runScript(testDatabaseEnums)
