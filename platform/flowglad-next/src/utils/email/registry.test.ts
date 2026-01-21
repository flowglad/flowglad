import { describe, expect, it } from 'vitest'
import {
  EMAIL_REGISTRY,
  type EmailType,
  getEmailTypeCount,
} from './registry'

describe('EMAIL_REGISTRY', () => {
  it('has valid structure with all required fields and correct types for each entry', () => {
    // Verify the count
    const count = getEmailTypeCount()
    expect(count).toBe(23)

    const requiredFields = [
      'getTemplate',
      'defaultSubject',
      'recipientType',
      'category',
      'description',
      'requiresAwait',
    ] as const

    const validRecipientTypes = [
      'customer',
      'organization',
      'internal',
    ]
    const validCategories = [
      'subscription',
      'payment',
      'auth',
      'notification',
      'export',
      'trial',
    ]

    for (const [emailType, config] of Object.entries(
      EMAIL_REGISTRY
    )) {
      // Required fields are present
      for (const field of requiredFields) {
        expect(
          config[field] !== undefined && config[field] !== null,
          `${emailType} is missing required field: ${field}`
        ).toBe(true)
      }

      // getTemplate is a function
      expect(
        typeof config.getTemplate,
        `${emailType}.getTemplate should be a function`
      ).toBe('function')

      // Valid recipientType
      expect(
        validRecipientTypes,
        `${emailType} has invalid recipientType: ${config.recipientType}`
      ).toContain(config.recipientType)

      // Valid category
      expect(
        validCategories,
        `${emailType} has invalid category: ${config.category}`
      ).toContain(config.category)

      // Non-empty description
      expect(
        config.description.length,
        `${emailType} has empty description`
      ).toBeGreaterThan(0)

      // requiresAwait is true (per architecture doc, all React Email templates must be awaited)
      expect(
        config.requiresAwait,
        `${emailType} should have requiresAwait: true`
      ).toBe(true)
    }
  })

  it('follows naming conventions and recipientType consistency for all email types', () => {
    const customerTypes = (
      Object.keys(EMAIL_REGISTRY) as EmailType[]
    ).filter((type) => type.startsWith('customer.'))

    const orgTypes = (
      Object.keys(EMAIL_REGISTRY) as EmailType[]
    ).filter((type) => type.startsWith('organization.'))

    // Customer emails follow customer.{category}.{action} pattern and have customer recipientType
    for (const type of customerTypes) {
      const parts = type.split('.')
      expect(
        parts.length,
        `${type} should have 3 parts (customer.category.action)`
      ).toBe(3)
      expect(parts[0]).toBe('customer')

      const config = EMAIL_REGISTRY[type]
      expect(
        config.recipientType,
        `${type} should have recipientType: 'customer'`
      ).toBe('customer')
    }

    // Organization emails follow organization.{category}.{action} pattern and have organization recipientType
    for (const type of orgTypes) {
      const parts = type.split('.')
      expect(
        parts.length,
        `${type} should have 3 parts (organization.category.action)`
      ).toBe(3)
      expect(parts[0]).toBe('organization')

      const config = EMAIL_REGISTRY[type]
      expect(
        config.recipientType,
        `${type} should have recipientType: 'organization'`
      ).toBe('organization')
    }
  })
})

describe('getEmailTypeCount', () => {
  it('returns the correct count of registered email types', () => {
    const count = getEmailTypeCount()
    const actualCount = Object.keys(EMAIL_REGISTRY).length

    expect(count).toBe(actualCount)
  })
})
