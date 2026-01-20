import { kebabCase } from 'change-case'

/**
 * Email recipient types for determining appropriate branding.
 *
 * - `customer`: End users interacting with a merchant's product. Use org branding.
 * - `organization`: Merchants/platform users. Use Flowglad branding.
 * - `internal`: System/alert emails. Use Flowglad branding.
 */
export type EmailRecipientType =
  | 'customer'
  | 'organization'
  | 'internal'

/**
 * Returns a properly formatted "from" address for emails based on recipient type.
 *
 * Following Stripe's model for payment platform emails:
 * - Customer emails use organization branding (customers feel they're interacting with the merchant)
 * - Organization emails use Flowglad branding (merchants know they're using Flowglad)
 * - Internal emails use Flowglad branding
 *
 * @example
 * ```ts
 * // Customer-facing email
 * getFromAddress({ recipientType: 'customer', organizationName: 'Acme Inc' })
 * // => 'Acme Inc Billing <acme-inc-billing@flowglad.com>'
 *
 * // Organization email (merchant notification)
 * getFromAddress({ recipientType: 'organization' })
 * // => 'Flowglad <notifications@flowglad.com>'
 *
 * // Internal/system email
 * getFromAddress({ recipientType: 'internal' })
 * // => 'Flowglad <alerts@flowglad.com>'
 * ```
 */
export const getFromAddress = (params: {
  recipientType: EmailRecipientType
  organizationName?: string
}): string => {
  switch (params.recipientType) {
    case 'customer':
      if (params.organizationName) {
        const slug = kebabCase(params.organizationName)
        return `${params.organizationName} Billing <${slug}-billing@flowglad.com>`
      }
      return 'Flowglad Billing <billing@flowglad.com>'
    case 'organization':
      return 'Flowglad <notifications@flowglad.com>'
    case 'internal':
      return 'Flowglad <alerts@flowglad.com>'
  }
}
