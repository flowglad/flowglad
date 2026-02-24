import type { CreateEmailResponse } from 'resend'
import { panic } from '@/errors'
import core from '@/utils/core'
import { formatEmailSubject, safeSend } from '@/utils/email'
import { getFromAddress } from './fromAddress'
import {
  EMAIL_REGISTRY,
  type EmailPropsFor,
  type EmailType,
} from './registry'
import {
  EMAIL_VALIDATION_SCHEMAS,
  validateEmailProps,
} from './validation'

/**
 * Safe redirect for non-production emails.
 * In production, returns the email as-is.
 * In development/test, redirects to DEV_EMAIL_REDIRECT (required).
 */
const safeTo = (email: string): string => {
  if (core.IS_PROD) {
    return email
  }

  const devRedirect = core.envVariable('DEV_EMAIL_REDIRECT')
  if (!devRedirect) {
    panic(
      'DEV_EMAIL_REDIRECT environment variable is required in non-production environments. ' +
        'Set it to your email address or a test sink address to receive redirected emails.'
    )
  }
  return devRedirect
}

/**
 * Parameters for sending an email using the registry.
 */
export interface SendEmailParams<T extends EmailType> {
  /** The email type from the registry */
  type: T
  /** Recipient email addresses */
  to: string[]
  /** Props for the email template */
  props: EmailPropsFor<T>
  /** Organization name for customer-facing emails (used for branding) */
  organizationName?: string
  /** Whether this is a livemode email */
  livemode: boolean
  /** Optional reply-to address */
  replyTo?: string
  /** Optional subject override (will still apply [TEST] prefix if not livemode) */
  subjectOverride?: string
  /** Whether to skip validation (not recommended for production) */
  skipValidation?: boolean
}

/**
 * Unified email sending function using the email registry.
 *
 * This function:
 * 1. Validates props against the schema (if available and not skipped)
 * 2. Looks up the email configuration from the registry
 * 3. Computes the subject line (with [TEST] prefix if not livemode)
 * 4. Renders the template with await
 * 5. Sends the email with proper branding
 *
 * @example
 * ```ts
 * // Send a customer subscription created email
 * await sendEmail({
 *   type: 'customer.subscription.created',
 *   to: ['customer@example.com'],
 *   props: {
 *     customerName: 'John Doe',
 *     organizationName: 'Acme Inc',
 *     // ... other props
 *   },
 *   organizationName: 'Acme Inc',
 *   livemode: true,
 * })
 *
 * // Send an organization notification
 * await sendEmail({
 *   type: 'organization.subscription.created',
 *   to: ['merchant@example.com'],
 *   props: {
 *     organizationName: 'Acme Inc',
 *     customerName: 'John Doe',
 *     // ... other props
 *   },
 *   livemode: true,
 * })
 * ```
 */
export const sendEmail = async <T extends EmailType>({
  type,
  to,
  props,
  organizationName,
  livemode,
  replyTo,
  subjectOverride,
  skipValidation = false,
}: SendEmailParams<T>): Promise<CreateEmailResponse | undefined> => {
  // Validate props if schema exists and validation is not skipped
  if (!skipValidation) {
    const schema =
      EMAIL_VALIDATION_SCHEMAS[
        type as keyof typeof EMAIL_VALIDATION_SCHEMAS
      ]
    if (schema) {
      validateEmailProps(schema, props, type)
    }
  }

  const config = EMAIL_REGISTRY[type]

  // Compute subject
  const baseSubject =
    subjectOverride ??
    (typeof config.defaultSubject === 'function'
      ? config.defaultSubject(props as never)
      : config.defaultSubject)

  // Load and render template
  const template = await config.getTemplate()
  const renderedTemplate = await template(props as never)

  // Send email
  return safeSend(
    {
      from: getFromAddress({
        recipientType: config.recipientType,
        organizationName,
      }),
      to: to.map(safeTo),
      subject: formatEmailSubject(baseSubject, livemode),
      replyTo,
      react: renderedTemplate,
    },
    { templateName: type }
  )
}

/**
 * Type-safe helper to get the default subject for an email type.
 * Useful for testing or displaying subject previews.
 *
 * @param type - The email type
 * @param props - The props (required if defaultSubject is a function)
 * @returns The computed subject string
 */
export const getDefaultSubject = <T extends EmailType>(
  type: T,
  props?: EmailPropsFor<T>
): string => {
  const config = EMAIL_REGISTRY[type]

  if (typeof config.defaultSubject === 'function') {
    if (!props) {
      panic(
        `Props are required to compute subject for email type: ${type}`
      )
    }
    return config.defaultSubject(props as never)
  }

  return config.defaultSubject
}

/**
 * Get the email configuration for a specific type.
 * Useful for inspection and testing.
 *
 * @param type - The email type
 * @returns The email configuration (without template)
 */
export const getEmailConfig = <T extends EmailType>(
  type: T
): Omit<(typeof EMAIL_REGISTRY)[T], 'getTemplate'> => {
  const { getTemplate: _, ...config } = EMAIL_REGISTRY[type]
  return config
}
