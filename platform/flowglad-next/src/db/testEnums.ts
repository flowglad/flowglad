import {
  BillingPeriodStatus,
  BillingRunStatus,
  BusinessOnboardingStatus,
  CheckoutSessionStatus,
  CheckoutSessionType,
  CurrencyCode,
  DiscountAmountType,
  DiscountDuration,
  EventNoun,
  FeatureType,
  FeatureUsageGrantFrequency,
  FeeCalculationType,
  FlowgladApiKeyType,
  FlowgladEventType,
  IntervalUnit,
  InvoiceStatus,
  InvoiceType,
  LedgerEntryDirection,
  LedgerEntryStatus,
  NormalBalanceType,
  PaymentMethodType,
  PaymentStatus,
  PriceType,
  PurchaseStatus,
  RefundStatus,
  StripeConnectContractType,
  SubscriptionMeterPeriodCalculationStatus,
  SubscriptionStatus,
  UsageCreditStatus,
  UsageCreditType,
  UsageMeterAggregationType,
} from '@db-core/enums'
import { apiKeys } from '@db-core/schema/apiKeys'
import { billingPeriods } from '@db-core/schema/billingPeriods'
import { billingRuns } from '@db-core/schema/billingRuns'
import { checkoutSessions } from '@db-core/schema/checkoutSessions'
import { discountRedemptions } from '@db-core/schema/discountRedemptions'
import { discounts } from '@db-core/schema/discounts'
import { events } from '@db-core/schema/events'
import { features } from '@db-core/schema/features'
import { feeCalculations } from '@db-core/schema/feeCalculations'
import { invoices } from '@db-core/schema/invoices'
import { ledgerAccounts } from '@db-core/schema/ledgerAccounts'
import { ledgerEntries } from '@db-core/schema/ledgerEntries'
import { organizations } from '@db-core/schema/organizations'
import { paymentMethods } from '@db-core/schema/paymentMethods'
import { payments } from '@db-core/schema/payments'
import { prices } from '@db-core/schema/prices'
import { purchases } from '@db-core/schema/purchases'
import { refunds } from '@db-core/schema/refunds'
import { subscriptionMeterPeriodCalculations } from '@db-core/schema/subscriptionMeterPeriodCalculations'
import { subscriptions } from '@db-core/schema/subscriptions'
// Add new schema imports needed for the moved tests
import { usageCredits } from '@db-core/schema/usageCredits'
import { usageMeters } from '@db-core/schema/usageMeters'
import { testEnumColumn } from '@db-core/tableUtils'
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
