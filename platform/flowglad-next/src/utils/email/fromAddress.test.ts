import { describe, expect, it } from 'vitest'
import { getFromAddress } from './fromAddress'

describe('getFromAddress', () => {
  describe('customer recipient type', () => {
    it('returns org-branded address when organizationName provided', () => {
      const result = getFromAddress({
        recipientType: 'customer',
        organizationName: 'Acme Inc',
      })

      expect(result).toBe(
        'Acme Inc Billing <acme-inc-billing@flowglad.com>'
      )
    })

    it('returns fallback Flowglad address when organizationName missing', () => {
      const result = getFromAddress({
        recipientType: 'customer',
      })

      expect(result).toBe('Flowglad Billing <billing@flowglad.com>')
    })

    it('returns fallback Flowglad address when organizationName is undefined', () => {
      const result = getFromAddress({
        recipientType: 'customer',
        organizationName: undefined,
      })

      expect(result).toBe('Flowglad Billing <billing@flowglad.com>')
    })

    it('handles organization names with spaces', () => {
      const result = getFromAddress({
        recipientType: 'customer',
        organizationName: 'My SaaS App',
      })

      // kebabCase splits camelCase 'SaaS' into 'saa-s'
      expect(result).toBe(
        'My SaaS App Billing <my-saa-s-app-billing@flowglad.com>'
      )
    })

    it('handles organization names with special characters', () => {
      const result = getFromAddress({
        recipientType: 'customer',
        organizationName: 'My SaaS App 2.0',
      })

      // kebabCase should convert "2.0" appropriately
      expect(result).toBe(
        'My SaaS App 2.0 Billing <my-saa-s-app-2-0-billing@flowglad.com>'
      )
    })

    it('handles organization names with apostrophes', () => {
      const result = getFromAddress({
        recipientType: 'customer',
        organizationName: "Bob's Store",
      })

      expect(result).toBe(
        "Bob's Store Billing <bob-s-store-billing@flowglad.com>"
      )
    })

    it('handles organization names that are already kebab-case', () => {
      const result = getFromAddress({
        recipientType: 'customer',
        organizationName: 'already-kebab-case',
      })

      expect(result).toBe(
        'already-kebab-case Billing <already-kebab-case-billing@flowglad.com>'
      )
    })

    it('handles organization names with mixed casing', () => {
      const result = getFromAddress({
        recipientType: 'customer',
        organizationName: 'SuperApp PRO',
      })

      expect(result).toBe(
        'SuperApp PRO Billing <super-app-pro-billing@flowglad.com>'
      )
    })
  })

  describe('organization recipient type', () => {
    it('always returns Flowglad notifications address', () => {
      const result = getFromAddress({
        recipientType: 'organization',
      })

      expect(result).toBe('Flowglad <notifications@flowglad.com>')
    })

    it('ignores organizationName when recipient type is organization', () => {
      const result = getFromAddress({
        recipientType: 'organization',
        organizationName: 'Acme Inc',
      })

      expect(result).toBe('Flowglad <notifications@flowglad.com>')
    })
  })

  describe('internal recipient type', () => {
    it('always returns Flowglad alerts address', () => {
      const result = getFromAddress({
        recipientType: 'internal',
      })

      expect(result).toBe('Flowglad <alerts@flowglad.com>')
    })

    it('ignores organizationName when recipient type is internal', () => {
      const result = getFromAddress({
        recipientType: 'internal',
        organizationName: 'Acme Inc',
      })

      expect(result).toBe('Flowglad <alerts@flowglad.com>')
    })
  })
})
