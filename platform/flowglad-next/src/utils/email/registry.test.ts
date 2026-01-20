import { describe, expect, it } from 'vitest'
import {
  EMAIL_REGISTRY,
  type EmailType,
  getEmailTypeCount,
} from './registry'

describe('EMAIL_REGISTRY', () => {
  it('contains entries for all email types', () => {
    // The registry should have 23 email types
    const count = getEmailTypeCount()
    expect(count).toBe(23)
  })

  it('each entry has all required configuration fields', () => {
    const requiredFields = [
      'getTemplate',
      'defaultSubject',
      'recipientType',
      'category',
      'description',
      'requiresAwait',
    ] as const

    for (const [emailType, config] of Object.entries(
      EMAIL_REGISTRY
    )) {
      for (const field of requiredFields) {
        expect(
          config[field] !== undefined && config[field] !== null,
          `${emailType} is missing required field: ${field}`
        ).toBe(true)
      }
    }
  })

  it('all entries have getTemplate as a function', () => {
    for (const [emailType, config] of Object.entries(
      EMAIL_REGISTRY
    )) {
      expect(
        typeof config.getTemplate,
        `${emailType}.getTemplate should be a function`
      ).toBe('function')
    }
  })

  it('all entries have valid recipientType', () => {
    const validTypes = ['customer', 'organization', 'internal']

    for (const [emailType, config] of Object.entries(
      EMAIL_REGISTRY
    )) {
      expect(
        validTypes,
        `${emailType} has invalid recipientType: ${config.recipientType}`
      ).toContain(config.recipientType)
    }
  })

  it('all entries have valid category', () => {
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
      expect(
        validCategories,
        `${emailType} has invalid category: ${config.category}`
      ).toContain(config.category)
    }
  })

  it('all entries have non-empty description', () => {
    for (const [emailType, config] of Object.entries(
      EMAIL_REGISTRY
    )) {
      expect(
        config.description.length,
        `${emailType} has empty description`
      ).toBeGreaterThan(0)
    }
  })

  it('all entries have requiresAwait set to true', () => {
    // Per the architecture doc, all React Email templates must be awaited
    for (const [emailType, config] of Object.entries(
      EMAIL_REGISTRY
    )) {
      expect(
        config.requiresAwait,
        `${emailType} should have requiresAwait: true`
      ).toBe(true)
    }
  })

  describe('email type naming convention', () => {
    it('customer emails follow customer.{category}.{action} pattern', () => {
      const customerTypes = (
        Object.keys(EMAIL_REGISTRY) as EmailType[]
      ).filter((type) => type.startsWith('customer.'))

      for (const type of customerTypes) {
        const parts = type.split('.')
        expect(
          parts.length,
          `${type} should have 3 parts (customer.category.action)`
        ).toBe(3)
        expect(parts[0]).toBe('customer')
      }
    })

    it('organization emails follow organization.{category}.{action} pattern', () => {
      const orgTypes = (
        Object.keys(EMAIL_REGISTRY) as EmailType[]
      ).filter((type) => type.startsWith('organization.'))

      for (const type of orgTypes) {
        const parts = type.split('.')
        expect(
          parts.length,
          `${type} should have 3 parts (organization.category.action)`
        ).toBe(3)
        expect(parts[0]).toBe('organization')
      }
    })
  })

  describe('recipientType matches email category', () => {
    it('customer emails have customer recipientType', () => {
      const customerTypes = (
        Object.keys(EMAIL_REGISTRY) as EmailType[]
      ).filter((type) => type.startsWith('customer.'))

      for (const type of customerTypes) {
        const config = EMAIL_REGISTRY[type]
        expect(
          config.recipientType,
          `${type} should have recipientType: 'customer'`
        ).toBe('customer')
      }
    })

    it('organization emails have organization recipientType', () => {
      const orgTypes = (
        Object.keys(EMAIL_REGISTRY) as EmailType[]
      ).filter((type) => type.startsWith('organization.'))

      for (const type of orgTypes) {
        const config = EMAIL_REGISTRY[type]
        expect(
          config.recipientType,
          `${type} should have recipientType: 'organization'`
        ).toBe('organization')
      }
    })
  })
})

describe('getEmailTypeCount', () => {
  it('returns the correct count of registered email types', () => {
    const count = getEmailTypeCount()
    const actualCount = Object.keys(EMAIL_REGISTRY).length

    expect(count).toBe(actualCount)
  })
})
