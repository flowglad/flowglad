import { describe, expect, it } from 'vitest'
import {
  EMAIL_REGISTRY,
  type EmailType,
  getEmailTypeCount,
} from '@/utils/email/registry'
import {
  EMAIL_VALIDATION_SCHEMAS,
  validateEmailProps,
} from '@/utils/email/validation'
import {
  EMAIL_PREVIEWS,
  getAllEmailTypesWithPreviews,
  getPreviewData,
  getVariantsForEmailType,
} from './mockData'

describe('EMAIL_PREVIEWS', () => {
  it('has preview data for all registered email types', () => {
    const registeredTypes = Object.keys(EMAIL_REGISTRY) as EmailType[]
    const previewTypes = getAllEmailTypesWithPreviews()

    for (const emailType of registeredTypes) {
      expect(
        previewTypes,
        `Missing preview data for ${emailType}`
      ).toContain(emailType)
    }
  })

  it('each email type has at least a default variant', () => {
    const previewTypes = getAllEmailTypesWithPreviews()

    for (const emailType of previewTypes) {
      const variants = getVariantsForEmailType(emailType)
      expect(
        variants,
        `${emailType} must have a "default" variant`
      ).toContain('default')
    }
  })

  it('preview data passes validation schemas', () => {
    const previewTypes = getAllEmailTypesWithPreviews()

    for (const emailType of previewTypes) {
      const schema =
        EMAIL_VALIDATION_SCHEMAS[
          emailType as keyof typeof EMAIL_VALIDATION_SCHEMAS
        ]
      if (!schema) {
        // Skip if no schema exists (should be none based on our implementation)
        continue
      }

      const variants = getVariantsForEmailType(emailType)
      for (const variant of variants) {
        const previewData = getPreviewData(emailType, variant)

        expect(
          () => validateEmailProps(schema, previewData, emailType),
          `${emailType}/${variant} should pass validation`
        ).not.toThrow()
      }
    }
  })
})

describe('getVariantsForEmailType', () => {
  it('returns all variants for customer.subscription.created', () => {
    const variants = getVariantsForEmailType(
      'customer.subscription.created'
    )

    expect(variants).toContain('default')
    expect(variants).toContain('withTrial')
    expect(variants).toContain('yearly')
  })

  it('returns variants for customer.subscription.adjusted', () => {
    const variants = getVariantsForEmailType(
      'customer.subscription.adjusted'
    )

    expect(variants).toContain('upgrade')
    expect(variants).toContain('downgrade')
  })

  it('returns default only for organization.notification.payouts-enabled', () => {
    const variants = getVariantsForEmailType(
      'organization.notification.payouts-enabled'
    )

    expect(variants).toEqual(['default'])
  })
})

describe('getPreviewData', () => {
  it('returns default variant when no variant specified', () => {
    const data = getPreviewData(
      'organization.notification.payouts-enabled'
    )

    // Using specific value assertion instead of toBeNull
    expect(data?.organizationName).toBe('Acme Corp')
  })

  it('returns specific variant when specified', () => {
    const data = getPreviewData(
      'customer.subscription.created',
      'withTrial'
    )

    // Using specific value assertions instead of toBeNull
    expect(data?.trial?.trialDurationDays).toBe(14)
    expect(data?.trial?.trialEndDate).toBeInstanceOf(Date)
  })

  it('returns undefined for non-existent variant', () => {
    const data = getPreviewData(
      'organization.notification.payouts-enabled',
      'nonexistent'
    )

    expect(data).toBeUndefined()
  })
})

describe('getAllEmailTypesWithPreviews', () => {
  it('returns array of email types', () => {
    const types = getAllEmailTypesWithPreviews()

    expect(Array.isArray(types)).toBe(true)
    expect(types.length).toBe(getEmailTypeCount())
  })

  it('includes both customer and organization email types', () => {
    const types = getAllEmailTypesWithPreviews()

    const customerTypes = types.filter((t) =>
      t.startsWith('customer.')
    )
    const orgTypes = types.filter((t) =>
      t.startsWith('organization.')
    )

    expect(customerTypes.length).toBeGreaterThan(0)
    expect(orgTypes.length).toBeGreaterThan(0)
  })
})

describe('preview data structure', () => {
  it('customer.subscription.created default has required fields', () => {
    const data = getPreviewData('customer.subscription.created')

    expect(data?.customerName).toBe('John Doe')
    expect(data?.organizationName).toBe('Acme Corp')
    expect(data?.planName).toBe('Pro Plan')
    expect(data?.price).toBe(2900)
  })

  it('customer.payment.receipt merchantOfRecord variant has isMoR flag', () => {
    const data = getPreviewData(
      'customer.payment.receipt',
      'merchantOfRecord'
    )

    expect(data?.isMoR).toBe(true)
  })

  it('organization emails have livemode flag where appropriate', () => {
    const data = getPreviewData('organization.subscription.created')

    expect(data?.livemode).toBe(true)
  })
})
