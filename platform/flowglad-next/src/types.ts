/**
 * Application-specific types.
 *
 * NOTE: Database schema enums have been moved to db-core/enums.ts.
 * Import those from '@db-core/enums' instead of this file.
 */

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

// Import SupabasePayloadType from db-core for these interfaces
import { SupabasePayloadType } from '@db-core/enums'

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

export enum CancellationReason {
  UpgradedToPaid = 'upgraded_to_paid',
  CustomerRequest = 'customer_request',
  NonPayment = 'non_payment',
  PricingModelMigration = 'pricing_model_migration',
  Other = 'other',
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

// Re-export CheckoutSessionType for SetupIntentableCheckoutSessionType
import { CheckoutSessionType } from '@db-core/enums'
export type SetupIntentableCheckoutSessionType = CheckoutSessionType

export enum FeatureFlag {
  Usage = 'usage',
  ImmediateSubscriptionAdjustments = 'immediate_subscription_adjustments',
  SubscriptionWithUsage = 'subscription_with_usage',
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

// Re-export LedgerEntryType for type definitions
import { LedgerEntryType } from '@db-core/enums'

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
