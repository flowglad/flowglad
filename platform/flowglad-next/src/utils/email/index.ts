/**
 * Email utility module providing centralized email infrastructure.
 *
 * @module utils/email
 */

// From address helper
export {
  type EmailRecipientType,
  getFromAddress,
} from './fromAddress'

// Notification context builders
export {
  type BaseNotificationContext,
  buildNotificationContext,
  type CustomerNotificationContext,
  type OrganizationMembersNotificationContext,
  type OrganizationOnlyMembersNotificationContext,
  type SubscriptionNotificationContext,
} from './notificationContext'

// Email registry
export {
  type CustomerBillingPortalMagicLinkProps,
  type CustomerBillingPortalOTPProps,
  type CustomerOrderReceiptProps,
  type CustomerPaymentFailedProps,
  type CustomerSubscriptionAdjustedProps,
  type CustomerSubscriptionCanceledProps,
  type CustomerSubscriptionCancellationScheduledProps,
  type CustomerSubscriptionCreatedProps,
  type CustomerSubscriptionUpgradedProps,
  type CustomersCsvExportReadyProps,
  type CustomerTrialExpiredNoPaymentProps,
  EMAIL_REGISTRY,
  type EmailCategory,
  type EmailPropsFor,
  type EmailRegistryEntry,
  type EmailType,
  type EmailTypeMap,
  type ForgotPasswordProps,
  getEmailTypeCount,
  type OrganizationInvitationProps,
  type OrganizationOnboardingCompletedProps,
  type OrganizationPaymentAwaitingConfirmationProps,
  type OrganizationPaymentFailedProps,
  type OrganizationPaymentSucceededProps,
  type OrganizationPayoutsEnabledProps,
  type OrganizationSubscriptionAdjustedProps,
  type OrganizationSubscriptionCanceledProps,
  type OrganizationSubscriptionCancellationScheduledProps,
  type OrganizationSubscriptionCreatedProps,
  type PurchaseAccessSessionTokenProps,
} from './registry'
// Unified send function
export {
  getDefaultSubject,
  getEmailConfig,
  type SendEmailParams,
  sendEmail,
} from './sendEmail'
// Validation
export {
  CustomerBillingPortalMagicLinkSchema,
  CustomerBillingPortalOTPSchema,
  CustomerOrderReceiptSchema,
  CustomerPaymentFailedSchema,
  CustomerSubscriptionAdjustedSchema,
  CustomerSubscriptionCanceledSchema,
  CustomerSubscriptionCancellationScheduledSchema,
  CustomerSubscriptionCreatedSchema,
  CustomerSubscriptionUpgradedSchema,
  CustomersCsvExportReadySchema,
  CustomerTrialExpiredNoPaymentSchema,
  EMAIL_VALIDATION_SCHEMAS,
  ForgotPasswordSchema,
  OrganizationInvitationSchema,
  OrganizationOnboardingCompletedSchema,
  OrganizationPaymentAwaitingConfirmationSchema,
  OrganizationPaymentFailedSchema,
  OrganizationPaymentSucceededSchema,
  OrganizationPayoutsEnabledSchema,
  OrganizationSubscriptionAdjustedSchema,
  OrganizationSubscriptionCanceledSchema,
  OrganizationSubscriptionCancellationScheduledSchema,
  OrganizationSubscriptionCreatedSchema,
  validateEmailProps,
  validateEmailPropsForType,
} from './validation'
