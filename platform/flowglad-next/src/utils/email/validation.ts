import { z } from 'zod'
import { CurrencyCode, IntervalUnit } from '@/types'
import type { EmailType } from './registry'

// ============================================================================
// Common Schema Components
// ============================================================================

const CurrencyCodeSchema = z.enum(CurrencyCode)
const IntervalUnitSchema = z.enum(IntervalUnit)

const SubscriptionItemSchema = z.object({
  name: z.string(),
  unitPrice: z.number(),
  quantity: z.number(),
})

const LineItemSchema = z.object({
  name: z.string(),
  price: z.number(),
  quantity: z.number(),
})

const DiscountInfoSchema = z
  .object({
    discountName: z.string(),
    discountCode: z.string(),
    discountAmount: z.number(),
    discountAmountType: z.string(),
  })
  .nullable()
  .optional()

const InvoiceSchema = z.object({
  subtotal: z.number().nullable(),
  taxAmount: z.number().nullable(),
  currency: CurrencyCodeSchema,
})

const TrialInfoSchema = z.object({
  trialEndDate: z.coerce.date(),
  trialDurationDays: z.number(),
})

// ============================================================================
// Customer Subscription Email Schemas
// ============================================================================

export const CustomerSubscriptionCreatedSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  organizationLogoUrl: z.string().url().optional(),
  organizationId: z.string().min(1, 'Organization ID is required'),
  customerExternalId: z
    .string()
    .min(1, 'Customer external ID is required'),
  planName: z.string().min(1, 'Plan name is required'),
  price: z.number().min(0, 'Price must be non-negative'),
  currency: CurrencyCodeSchema,
  interval: IntervalUnitSchema.optional(),
  nextBillingDate: z.coerce.date().optional(),
  paymentMethodLast4: z.string().length(4).optional(),
  trial: TrialInfoSchema.optional(),
  dateConfirmed: z.coerce.date().optional(),
})

export const CustomerSubscriptionCanceledSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  organizationLogoUrl: z.string().url().optional(),
  organizationId: z.string().min(1, 'Organization ID is required'),
  customerId: z.string().min(1, 'Customer ID is required'),
  subscriptionName: z
    .string()
    .min(1, 'Subscription name is required'),
  cancellationDate: z.coerce.date(),
  livemode: z.boolean(),
})

export const CustomerSubscriptionCancellationScheduledSchema =
  z.object({
    customerName: z.string().min(1, 'Customer name is required'),
    organizationName: z
      .string()
      .min(1, 'Organization name is required'),
    organizationLogoUrl: z.string().url().optional(),
    organizationId: z.string().min(1, 'Organization ID is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    subscriptionName: z
      .string()
      .min(1, 'Subscription name is required'),
    scheduledCancellationDate: z.coerce.date(),
    livemode: z.boolean(),
  })

export const CustomerSubscriptionAdjustedSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  organizationLogoUrl: z.string().url().optional(),
  organizationId: z.string().min(1, 'Organization ID is required'),
  adjustmentType: z.enum(['upgrade', 'downgrade']),
  previousItems: z.array(SubscriptionItemSchema).min(1),
  newItems: z.array(SubscriptionItemSchema).min(1),
  previousTotalPrice: z.number(),
  newTotalPrice: z.number(),
  currency: CurrencyCodeSchema,
  interval: IntervalUnitSchema.optional(),
  prorationAmount: z.number().nullable(),
  effectiveDate: z.coerce.date(),
  nextBillingDate: z.coerce.date().optional(),
})

export const CustomerSubscriptionUpgradedSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  organizationLogoUrl: z.string().url().optional(),
  organizationId: z.string().min(1, 'Organization ID is required'),
  customerExternalId: z
    .string()
    .min(1, 'Customer external ID is required'),
  previousPlanName: z
    .string()
    .min(1, 'Previous plan name is required'),
  previousPlanPrice: z.number().min(0),
  previousPlanCurrency: CurrencyCodeSchema,
  previousPlanInterval: IntervalUnitSchema.optional(),
  newPlanName: z.string().min(1, 'New plan name is required'),
  price: z.number().min(0, 'Price must be non-negative'),
  currency: CurrencyCodeSchema,
  interval: IntervalUnitSchema.optional(),
  nextBillingDate: z.coerce.date().optional(),
  paymentMethodLast4: z.string().length(4).optional(),
  trialing: z.boolean().optional(),
  dateConfirmed: z.coerce.date().optional(),
})

// ============================================================================
// Customer Payment Email Schemas
// ============================================================================

export const CustomerOrderReceiptSchema = z.object({
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  orderDate: z.string().min(1, 'Order date is required'),
  invoice: InvoiceSchema,
  organizationLogoUrl: z.string().url().optional(),
  organizationId: z.string().min(1, 'Organization ID is required'),
  customerId: z.string().min(1, 'Customer ID is required'),
  lineItems: z.array(LineItemSchema).min(1),
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  discountInfo: DiscountInfoSchema,
  livemode: z.boolean(),
  isMoR: z.boolean().optional(),
})

export const CustomerPaymentFailedSchema = z.object({
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  orderDate: z.coerce.date(),
  invoice: InvoiceSchema,
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  organizationLogoUrl: z.string().url().optional(),
  lineItems: z.array(LineItemSchema).min(1),
  retryDate: z.coerce.date().optional(),
  discountInfo: DiscountInfoSchema,
  failureReason: z.string().optional(),
  customerPortalUrl: z.string().url().optional(),
  livemode: z.boolean(),
})

// ============================================================================
// Customer Trial Email Schemas
// ============================================================================

export const CustomerTrialExpiredNoPaymentSchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  organizationLogoUrl: z.string().url().optional(),
  organizationId: z.string().min(1, 'Organization ID is required'),
  customerId: z.string().min(1, 'Customer ID is required'),
  planName: z.string().min(1, 'Plan name is required'),
  livemode: z.boolean(),
})

// ============================================================================
// Customer Auth Email Schemas
// ============================================================================

export const CustomerBillingPortalMagicLinkSchema = z.object({
  customerName: z.string().optional(),
  email: z.string().email('Invalid email address'),
  url: z.string().url('Invalid URL'),
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  livemode: z.boolean(),
})

export const CustomerBillingPortalOTPSchema = z.object({
  customerName: z.string().optional(),
  email: z.string().email('Invalid email address'),
  otp: z.string().min(1, 'OTP is required'),
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  livemode: z.boolean(),
})

export const ForgotPasswordSchema = z.object({
  user: z.string().min(1, 'User is required'),
  url: z.string().url('Invalid URL'),
})

export const PurchaseAccessSessionTokenSchema = z.object({
  magicLink: z.string().url().optional(),
  livemode: z.boolean(),
})

// ============================================================================
// Organization Subscription Email Schemas
// ============================================================================

export const OrganizationSubscriptionCreatedSchema = z.object({
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  subscriptionName: z
    .string()
    .min(1, 'Subscription name is required'),
  customerId: z.string().min(1, 'Customer ID is required'),
  customerName: z.string().min(1, 'Customer name is required'),
  customerEmail: z.string().email('Invalid email address'),
  livemode: z.boolean(),
})

export const OrganizationSubscriptionCanceledSchema = z.object({
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  subscriptionName: z
    .string()
    .min(1, 'Subscription name is required'),
  customerId: z.string().min(1, 'Customer ID is required'),
  customerName: z.string().min(1, 'Customer name is required'),
  customerEmail: z.string().email('Invalid email address'),
  cancellationDate: z.coerce.date(),
  livemode: z.boolean(),
})

export const OrganizationSubscriptionCancellationScheduledSchema =
  z.object({
    organizationName: z
      .string()
      .min(1, 'Organization name is required'),
    subscriptionName: z
      .string()
      .min(1, 'Subscription name is required'),
    customerId: z.string().min(1, 'Customer ID is required'),
    customerName: z.string().min(1, 'Customer name is required'),
    customerEmail: z.string().email('Invalid email address'),
    scheduledCancellationDate: z.coerce.date(),
    livemode: z.boolean(),
  })

export const OrganizationSubscriptionAdjustedSchema = z.object({
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  customerName: z.string().min(1, 'Customer name is required'),
  customerEmail: z.string().email().nullable(),
  customerId: z.string().min(1, 'Customer ID is required'),
  adjustmentType: z.enum(['upgrade', 'downgrade']),
  previousItems: z.array(SubscriptionItemSchema).min(1),
  newItems: z.array(SubscriptionItemSchema).min(1),
  previousTotalPrice: z.number(),
  newTotalPrice: z.number(),
  currency: CurrencyCodeSchema,
  prorationAmount: z.number().nullable(),
  effectiveDate: z.coerce.date(),
  livemode: z.boolean(),
})

// ============================================================================
// Organization Payment Email Schemas
// ============================================================================

export const OrganizationPaymentSucceededSchema = z.object({
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  amount: z.number().min(0),
  invoiceNumber: z.string().optional(),
  currency: CurrencyCodeSchema,
  customerId: z.string().min(1, 'Customer ID is required'),
  customerName: z.string().min(1, 'Customer name is required'),
  customerEmail: z.string().email('Invalid email address'),
  livemode: z.boolean(),
})

export const OrganizationPaymentFailedSchema = z.object({
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  amount: z.number().min(0),
  invoiceNumber: z.string().optional(),
  currency: CurrencyCodeSchema,
  customerId: z.string().min(1, 'Customer ID is required'),
  customerName: z.string().min(1, 'Customer name is required'),
  failureReason: z.string().optional(),
  livemode: z.boolean(),
})

export const OrganizationPaymentAwaitingConfirmationSchema = z.object(
  {
    organizationName: z
      .string()
      .min(1, 'Organization name is required'),
    amount: z.number().min(0),
    invoiceNumber: z.string().optional(),
    customerId: z.string().min(1, 'Customer ID is required'),
    currency: CurrencyCodeSchema,
    customerName: z.string().min(1, 'Customer name is required'),
    livemode: z.boolean(),
  }
)

// ============================================================================
// Organization Notification Email Schemas
// ============================================================================

export const OrganizationPayoutsEnabledSchema = z.object({
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
})

export const OrganizationOnboardingCompletedSchema = z.object({
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
})

export const OrganizationInvitationSchema = z.object({
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  inviterName: z.string().optional(),
})

export const CustomersCsvExportReadySchema = z.object({
  organizationName: z
    .string()
    .min(1, 'Organization name is required'),
  livemode: z.boolean(),
})

// ============================================================================
// Schema Registry
// ============================================================================

/**
 * Maps email types to their validation schemas.
 */
export const EMAIL_VALIDATION_SCHEMAS: Partial<
  Record<EmailType, z.ZodSchema>
> = {
  // Customer Subscription
  'customer.subscription.created': CustomerSubscriptionCreatedSchema,
  'customer.subscription.canceled':
    CustomerSubscriptionCanceledSchema,
  'customer.subscription.cancellation-scheduled':
    CustomerSubscriptionCancellationScheduledSchema,
  'customer.subscription.adjusted':
    CustomerSubscriptionAdjustedSchema,
  'customer.subscription.upgraded':
    CustomerSubscriptionUpgradedSchema,

  // Customer Payment
  'customer.payment.receipt': CustomerOrderReceiptSchema,
  'customer.payment.failed': CustomerPaymentFailedSchema,

  // Customer Trial
  'customer.trial.expired-no-payment':
    CustomerTrialExpiredNoPaymentSchema,

  // Customer Auth
  'customer.auth.billing-portal-magic-link':
    CustomerBillingPortalMagicLinkSchema,
  'customer.auth.billing-portal-otp': CustomerBillingPortalOTPSchema,
  'customer.auth.forgot-password': ForgotPasswordSchema,
  'customer.auth.purchase-access-token':
    PurchaseAccessSessionTokenSchema,

  // Organization Subscription
  'organization.subscription.created':
    OrganizationSubscriptionCreatedSchema,
  'organization.subscription.canceled':
    OrganizationSubscriptionCanceledSchema,
  'organization.subscription.cancellation-scheduled':
    OrganizationSubscriptionCancellationScheduledSchema,
  'organization.subscription.adjusted':
    OrganizationSubscriptionAdjustedSchema,

  // Organization Payment
  'organization.payment.succeeded':
    OrganizationPaymentSucceededSchema,
  'organization.payment.failed': OrganizationPaymentFailedSchema,
  'organization.payment.awaiting-confirmation':
    OrganizationPaymentAwaitingConfirmationSchema,

  // Organization Notification
  'organization.notification.payouts-enabled':
    OrganizationPayoutsEnabledSchema,
  'organization.notification.onboarding-completed':
    OrganizationOnboardingCompletedSchema,
  'organization.notification.invitation':
    OrganizationInvitationSchema,
  'organization.notification.csv-export-ready':
    CustomersCsvExportReadySchema,
}

// ============================================================================
// Validation Helper
// ============================================================================

/**
 * Validates email props against the schema for the given email type.
 * Throws a descriptive error if validation fails.
 *
 * @param schema - The Zod schema to validate against
 * @param props - The props to validate
 * @param emailType - The email type (for error messages)
 * @returns The validated props
 * @throws Error with descriptive message if validation fails
 */
export const validateEmailProps = <T>(
  schema: z.ZodSchema<T>,
  props: unknown,
  emailType: string
): T => {
  const result = schema.safeParse(props)

  if (!result.success) {
    const errors = result.error.issues
      .map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`)
      .join(', ')

    throw new Error(
      `Email validation failed for "${emailType}": ${errors}`
    )
  }

  return result.data
}

/**
 * Validates email props for a specific email type.
 * Returns the validated props or throws an error.
 *
 * @param emailType - The email type to validate for
 * @param props - The props to validate
 * @returns The validated props
 * @throws Error if no schema exists for the email type or validation fails
 */
export const validateEmailPropsForType = <T extends EmailType>(
  emailType: T,
  props: unknown
): unknown => {
  const schema = EMAIL_VALIDATION_SCHEMAS[emailType]

  if (!schema) {
    throw new Error(
      `No validation schema found for email type: ${emailType}`
    )
  }

  return validateEmailProps(schema, props, emailType)
}
