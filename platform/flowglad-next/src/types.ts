import {
  CheckoutSessionType,
  SupabasePayloadType,
} from '@db-core/enums'

export type Nullish<T> = T | null | undefined

export enum StripePriceMode {
  Subscription = 'subscription',
  Payment = 'payment',
}

export interface IdNumberParam {
  id: number
}

export type WithId<T> = T & IdNumberParam

export enum ChargeType {
  Charge = 'charge',
  Refund = 'refund',
}

export enum RevenueChartIntervalUnit {
  Year = 'year',
  Month = 'month',
  Week = 'week',
  Day = 'day',
  Hour = 'hour',
}

export enum InvoiceStatus {
  Draft = 'draft',
  Open = 'open',
  Paid = 'paid',
  Uncollectible = 'uncollectible',
  Void = 'void',
  FullyRefunded = 'refunded',
  PartiallyRefunded = 'partially_refunded',
  AwaitingPaymentConfirmation = 'awaiting_payment_confirmation',
}

export enum CheckoutFlowType {
  SinglePayment = 'single_payment',
  Subscription = 'subscription',
  Invoice = 'invoice',
  AddPaymentMethod = 'add_payment_method',
}

/**
 * Utility type to convert camelCase string to snake_case
 * Example: "payoutsEnabled" -> "payouts_enabled"
 */
type CamelToSnakeCase<S extends string> =
  S extends `${infer T}${infer U}`
    ? `${T extends Capitalize<T> ? '_' : ''}${Lowercase<T>}${CamelToSnakeCase<U>}`
    : S

/**
 * Recursively converts all keys in an object from camelCase to snake_case
 * This matches how Supabase sends database records in webhooks
 */
export type KeysToSnakeCase<T> = {
  [K in keyof T as CamelToSnakeCase<string & K>]: T[K] extends object
    ? T[K] extends Array<infer U>
      ? Array<KeysToSnakeCase<U>>
      : KeysToSnakeCase<T[K]>
    : T[K]
}

/**
 * Represents a database record with snake_case field names
 * Use this type for Supabase webhook payloads that come directly from the database
 */
export type SupabaseDatabaseRecord<T> = KeysToSnakeCase<T>

export interface SupabaseInsertPayload<T = object> {
  type: SupabasePayloadType.INSERT
  table: string
  schema: string
  record: T
}

export interface SupabaseUpdatePayload<T = object> {
  type: SupabasePayloadType.UPDATE
  table: string
  schema: string
  record: T
  old_record: T
}

/**
 * Supabase webhook payload with database records converted to snake_case
 * Use this when you need to access database field names directly (e.g., payouts_enabled)
 */
export interface SupabaseDatabaseUpdatePayload<T = object> {
  type: SupabasePayloadType.UPDATE
  table: string
  schema: string
  record: SupabaseDatabaseRecord<T>
  old_record: SupabaseDatabaseRecord<T>
}

/**
 * Basically the Stripe payment intent statuses,
 * BUT omitting:
 * - requires_capture (because we don't do pre-auths)
 * - requires_confirmation (because we don't do pre-auths)
 * - requires_payment_method (because we map this to a past payment, which implies a payment method)
 * -
 * @see https://docs.stripe.com/payments/payment-intents/verifying-status#checking-status-retrieve
 */
export enum PaymentStatus {
  // FIXME: remove "canceled"
  Canceled = 'canceled',
  Failed = 'failed',
  Refunded = 'refunded',
  Processing = 'processing',
  Succeeded = 'succeeded',
  RequiresConfirmation = 'requires_confirmation',
  RequiresAction = 'requires_action',
}

export enum CancellationReason {
  UpgradedToPaid = 'upgraded_to_paid',
  CustomerRequest = 'customer_request',
  NonPayment = 'non_payment',
  PricingModelMigration = 'pricing_model_migration',
  Other = 'other',
}

export enum CheckoutSessionStatus {
  Open = 'open',
  Pending = 'pending',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Expired = 'expired',
}

export enum FlowRunStatus {
  Completed = 'completed',
  Failed = 'failed',
}

export enum EventCategory {
  Financial = 'financial',
  Customer = 'customer',
  Subscription = 'subscription',
  System = 'system',
}

export enum EventRetentionPolicy {
  Permanent = 'permanent', // 7+ years
  Medium = 'medium', // 2-3 years
  Short = 'short', // 6-12 months
}

/**
 * experimental
 *
 * Used as metadata in procedures
 */
export type ProcedureInfo = {
  path: string
  description: string
  examples?: string[]
}

export enum CommunityPlatform {
  Discord = 'discord',
  Slack = 'slack',
}

export enum CommunityMembershipStatus {
  Active = 'active',
  Expired = 'expired',
  Cancelled = 'canceled',
  Banned = 'banned',
  Pending = 'pending',
  Unclaimed = 'unclaimed',
}

export type FileUploadData = {
  objectKey: string
  publicURL: string
}

export enum Nouns {
  Product = 'product',
  Price = 'price',
  Customer = 'customer',
  Discount = 'discount',
  File = 'file',
}

export enum Verbs {
  Create = 'create',
  Edit = 'edit',
}

export enum OnboardingItemType {
  Stripe = 'stripe',
  Product = 'product',
  Discount = 'discount',
  CopyKeys = 'copy_keys',
  InstallPackages = 'install_packages',
}

export interface OnboardingChecklistItem {
  title: string
  description: string
  completed: boolean
  inReview?: boolean
  action?: string
  type?: OnboardingItemType
}

export enum OfferingType {
  File = 'file',
  Link = 'link',
}

export type ApiEnvironment = 'test' | 'live'
export type ServiceContext = 'webapp' | 'api'
export type LogData = Record<string, any>
export type LoggerData = LogData & {
  service?: ServiceContext
  apiEnvironment?: ApiEnvironment
}

export enum FeeCalculationType {
  SubscriptionPayment = 'subscription_payment',
  CheckoutSessionPayment = 'checkout_session_payment',
}

export enum InvoiceType {
  Subscription = 'subscription',
  Purchase = 'purchase',
  Standalone = 'standalone',
}

export enum SubscriptionCancellationArrangement {
  Immediately = 'immediately',
  AtEndOfCurrentBillingPeriod = 'at_end_of_current_billing_period',
}

export enum SubscriptionCancellationRefundPolicy {
  ProrateRefund = 'prorate_refund',
  FullRefund = 'full_refund',
  NoRefund = 'no_refund',
  // ProrateAccountCredit = 'prorate_account_credit',
}

export enum SubscriptionAdjustmentTiming {
  Immediately = 'immediately',
  AtEndOfCurrentBillingPeriod = 'at_end_of_current_billing_period',
  Auto = 'auto',
  // AtFutureDate = 'at_future_date',
}

export type SetupIntentableCheckoutSessionType = CheckoutSessionType

export enum FeatureFlag {
  Usage = 'usage',
  ImmediateSubscriptionAdjustments = 'immediate_subscription_adjustments',
  SubscriptionWithUsage = 'subscription_with_usage',
}

export enum UsageCreditType {
  /**
   * Unlocked as a result of a subscription lifecycle event,
   * such as on creation.
   */
  Grant = 'grant',
  /**
   * Unlocked as a result of a payment, including a subscription payment.
   */
  Payment = 'payment',
}

export enum UsageCreditStatus {
  Pending = 'pending',
  Posted = 'posted',
}

export enum UsageCreditSourceReferenceType {
  InvoiceSettlement = 'invoice_settlement',
  ManualAdjustment = 'manual_adjustment',
  BillingPeriodTransition = 'billing_period_transition',
  // FIXME: Consider adding other types like Promotional, AdministrativeGrant, InitialSubscriptionGrant
}

export enum LedgerEntryStatus {
  Pending = 'pending',
  Posted = 'posted',
}

export enum LedgerEntryDirection {
  Debit = 'debit',
  Credit = 'credit',
}

export enum LedgerTransactionInitiatingSourceType {
  UsageEvent = 'usage_event',
  ManualAdjustment = 'manual_adjustment',
  BillingRun = 'billing_run',
  Admin = 'admin',
  CreditGrant = 'credit_grant',
  Refund = 'refund',
  InvoiceSettlement = 'invoice_settlement',
}

export enum PlanInterval {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  YEAR = 'year',
}

export enum LedgerEntryType {
  UsageCost = 'usage_cost',
  PaymentInitiated = 'payment_initiated',
  PaymentFailed = 'payment_failed',
  CreditGrantRecognized = 'credit_grant_recognized',
  CreditBalanceAdjusted = 'credit_balance_adjusted',
  CreditGrantExpired = 'credit_grant_expired',
  PaymentRefunded = 'payment_refunded',
  BillingAdjustment = 'billing_adjustment',
  UsageCreditApplicationDebitFromCreditBalance = 'usage_credit_application_debit_from_credit_balance',
  UsageCreditApplicationCreditTowardsUsageCost = 'usage_credit_application_credit_towards_usage_cost',
}

type CreditableEntryType =
  | 'payment_initiated'
  | 'credit_grant_recognized'

export type LedgerEntryDebitableEntryType = Exclude<
  LedgerEntryType,
  CreditableEntryType
>

export type LedgerEntryCreditableEntryType = Extract<
  LedgerEntryType,
  CreditableEntryType
>

export type StandardLogger = {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

// Telemetry types for trigger.dev debugging
export interface TelemetryRecord {
  runId: string
}

// Entities created/modified by trigger.dev tasks for debugging
export type TelemetryEntityType =
  | 'payment'
  | 'billing_run'
  | 'invoice'
  | 'billing_period'
  | 'subscription'
  | 'organization'
  | 'webhook'

export type UsageBillingInfo = {
  /**
   * Key of form `${usageMeterId}-${priceId}` for grouping usage events by meter and price.
   */
  usageMeterIdPriceId: string
  usageMeterId: string
  ledgerAccountId: string
  balance: number
  /**
   * The price ID associated with these usage events.
   */
  priceId: string
  usageEventsPerUnit: number
  unitPrice: number
  livemode: boolean
  name: string | null
  description: string | null
  usageEventIds: string[]
}
