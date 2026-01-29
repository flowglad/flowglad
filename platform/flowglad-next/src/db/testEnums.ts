import {
  BillingPeriodStatus,
  BillingRunStatus,
  BusinessOnboardingStatus,
  CheckoutSessionType,
  CurrencyCode,
  DiscountAmountType,
  DiscountDuration,
  EventNoun,
  FeatureType,
  FeatureUsageGrantFrequency,
  FlowgladApiKeyType,
  FlowgladEventType,
  IntervalUnit,
  NormalBalanceType,
  PaymentMethodType,
  PriceType,
  PurchaseStatus,
  RefundStatus,
  StripeConnectContractType,
  SubscriptionMeterPeriodCalculationStatus,
  SubscriptionStatus,
  UsageMeterAggregationType,
} from '@db-core/enums'
import { apiKeys } from '@/db/schema/apiKeys'
import { billingPeriods } from '@/db/schema/billingPeriods'
import { billingRuns } from '@/db/schema/billingRuns'
import { checkoutSessions } from '@/db/schema/checkoutSessions'
import { discountRedemptions } from '@/db/schema/discountRedemptions'
import { discounts } from '@/db/schema/discounts'
import { events } from '@/db/schema/events'
import { features } from '@/db/schema/features'
import { feeCalculations } from '@/db/schema/feeCalculations'
import { invoices } from '@/db/schema/invoices'
import { ledgerAccounts } from '@/db/schema/ledgerAccounts'
import { ledgerEntries } from '@/db/schema/ledgerEntries'
import { organizations } from '@/db/schema/organizations'
import { paymentMethods } from '@/db/schema/paymentMethods'
import { payments } from '@/db/schema/payments'
import { prices } from '@/db/schema/prices'
import { purchases } from '@/db/schema/purchases'
import { refunds } from '@/db/schema/refunds'
import { subscriptionMeterPeriodCalculations } from '@/db/schema/subscriptionMeterPeriodCalculations'
import { subscriptions } from '@/db/schema/subscriptions'
// Add new schema imports needed for the moved tests
import { usageCredits } from '@/db/schema/usageCredits'
import { usageMeters } from '@/db/schema/usageMeters'
import { testEnumColumn } from '@/db/tableUtils'
import {
  CheckoutSessionStatus,
  FeeCalculationType,
  InvoiceStatus,
  InvoiceType,
  LedgerEntryDirection,
  LedgerEntryStatus,
  PaymentStatus,
  UsageCreditStatus,
  UsageCreditType,
} from '@/types'
import type { DbTransaction } from './types'

export const testDatabaseEnums = async (
  transaction: DbTransaction
) => {
  // Payments table
  await testEnumColumn(
    payments,
    payments.paymentMethod,
    PaymentMethodType,
    transaction
  )
  await testEnumColumn(
    payments,
    payments.currency,
    CurrencyCode,
    transaction
  )
  await testEnumColumn(
    payments,
    payments.status,
    PaymentStatus,
    transaction
  )

  // Events table
  await testEnumColumn(
    events,
    events.type,
    FlowgladEventType,
    transaction
  )
  await testEnumColumn(
    events,
    events.objectEntity,
    EventNoun,
    transaction
  )

  // PaymentMethods table
  await testEnumColumn(
    paymentMethods,
    paymentMethods.type,
    PaymentMethodType,
    transaction
  )

  // Subscriptions table
  await testEnumColumn(
    subscriptions,
    subscriptions.status,
    SubscriptionStatus,
    transaction
  )
  await testEnumColumn(
    subscriptions,
    subscriptions.interval,
    IntervalUnit,
    transaction
  )

  // Purchases table
  await testEnumColumn(
    purchases,
    purchases.status,
    PurchaseStatus,
    transaction
  )
  await testEnumColumn(
    purchases,
    purchases.priceType,
    PriceType,
    transaction
  )
  await testEnumColumn(
    purchases,
    purchases.intervalUnit,
    IntervalUnit,
    transaction
  )

  // Discounts table
  await testEnumColumn(
    discounts,
    discounts.amountType,
    DiscountAmountType,
    transaction
  )
  await testEnumColumn(
    discounts,
    discounts.duration,
    DiscountDuration,
    transaction
  )

  // ApiKeys table
  await testEnumColumn(
    apiKeys,
    apiKeys.type,
    FlowgladApiKeyType,
    transaction
  )

  // CheckoutSessions table
  await testEnumColumn(
    checkoutSessions,
    checkoutSessions.status,
    CheckoutSessionStatus,
    transaction
  )
  await testEnumColumn(
    checkoutSessions,
    checkoutSessions.paymentMethodType,
    PaymentMethodType,
    transaction
  )
  await testEnumColumn(
    checkoutSessions,
    checkoutSessions.type,
    CheckoutSessionType,
    transaction
  )

  // BillingRuns table
  await testEnumColumn(
    billingRuns,
    billingRuns.status,
    BillingRunStatus,
    transaction
  )

  // DiscountRedemptions table
  await testEnumColumn(
    discountRedemptions,
    discountRedemptions.discountAmountType,
    DiscountAmountType,
    transaction
  )
  await testEnumColumn(
    discountRedemptions,
    discountRedemptions.duration,
    DiscountDuration,
    transaction
  )

  // FeeCalculations table
  await testEnumColumn(
    feeCalculations,
    feeCalculations.paymentMethodType,
    PaymentMethodType,
    transaction
  )
  await testEnumColumn(
    feeCalculations,
    feeCalculations.currency,
    CurrencyCode,
    transaction
  )
  await testEnumColumn(
    feeCalculations,
    feeCalculations.type,
    FeeCalculationType,
    transaction
  )

  // Organizations table
  await testEnumColumn(
    organizations,
    organizations.onboardingStatus,
    BusinessOnboardingStatus,
    transaction
  )
  await testEnumColumn(
    organizations,
    organizations.defaultCurrency,
    CurrencyCode,
    transaction
  )
  await testEnumColumn(
    organizations,
    organizations.stripeConnectContractType,
    StripeConnectContractType,
    transaction
  )

  // UsageMeters table
  await testEnumColumn(
    usageMeters,
    usageMeters.aggregationType,
    UsageMeterAggregationType,
    transaction
  )

  // Invoices table
  await testEnumColumn(
    invoices,
    invoices.status,
    InvoiceStatus,
    transaction
  )
  await testEnumColumn(
    invoices,
    invoices.type,
    InvoiceType,
    transaction
  )
  await testEnumColumn(
    invoices,
    invoices.currency,
    CurrencyCode,
    transaction
  )

  // BillingPeriods table
  await testEnumColumn(
    billingPeriods,
    billingPeriods.status,
    BillingPeriodStatus,
    transaction
  )

  // Prices table
  await testEnumColumn(
    prices,
    prices.intervalUnit,
    IntervalUnit,
    transaction
  )
  await testEnumColumn(prices, prices.type, PriceType, transaction)
  await testEnumColumn(
    prices,
    prices.currency,
    CurrencyCode,
    transaction
  )

  // START: Moved enum tests
  // UsageCredits table
  await testEnumColumn(
    usageCredits,
    usageCredits.creditType,
    UsageCreditType,
    transaction
  )
  await testEnumColumn(
    usageCredits,
    usageCredits.status,
    UsageCreditStatus,
    transaction
  )

  // Refunds table
  await testEnumColumn(
    refunds,
    refunds.status,
    RefundStatus,
    transaction
  )

  // LedgerEntries table
  await testEnumColumn(
    ledgerEntries,
    ledgerEntries.status,
    LedgerEntryStatus,
    transaction
  )
  await testEnumColumn(
    ledgerEntries,
    ledgerEntries.direction,
    LedgerEntryDirection,
    transaction
  )

  // SubscriptionMeterPeriodCalculations table
  await testEnumColumn(
    subscriptionMeterPeriodCalculations,
    subscriptionMeterPeriodCalculations.status,
    SubscriptionMeterPeriodCalculationStatus,
    transaction
  )
  // END: Moved enum tests

  // Features table
  await testEnumColumn(
    features,
    features.type,
    FeatureType,
    transaction
  )
  await testEnumColumn(
    features,
    features.renewalFrequency,
    FeatureUsageGrantFrequency,
    transaction
  )

  // LedgerAccounts table
  await testEnumColumn(
    ledgerAccounts,
    ledgerAccounts.normalBalance,
    NormalBalanceType,
    transaction
  )
}
