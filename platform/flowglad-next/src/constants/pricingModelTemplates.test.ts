import { describe, it, expect } from 'vitest'
import {
  USAGE_LIMIT_SUBSCRIPTION_TEMPLATE,
  UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE,
  PRICING_MODEL_TEMPLATES,
  getTemplateById,
} from './pricingModelTemplates'
import { isPricingModelTemplate } from '@/types/pricingModelTemplates'
import { validateSetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'

describe('Pricing Model Templates', () => {
  describe('Template Structure Validation', () => {
    it('should have valid structure for usage-limit template', () => {
      expect(
        isPricingModelTemplate(USAGE_LIMIT_SUBSCRIPTION_TEMPLATE)
      ).toBe(true)
      expect(USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.metadata.id).toBe(
        'usage-limit-subscription'
      )
      expect(
        USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.metadata.features
      ).toHaveLength(3)
    })

    it('should have valid structure for unlimited usage template', () => {
      expect(
        isPricingModelTemplate(UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE)
      ).toBe(true)
      expect(UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE.metadata.id).toBe(
        'unlimited-usage-subscription'
      )
      expect(
        UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE.metadata.features
      ).toHaveLength(3)
    })

    it('should have all templates in array', () => {
      expect(PRICING_MODEL_TEMPLATES).toHaveLength(2)
      expect(PRICING_MODEL_TEMPLATES).toContain(
        USAGE_LIMIT_SUBSCRIPTION_TEMPLATE
      )
      expect(PRICING_MODEL_TEMPLATES).toContain(
        UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE
      )
    })
  })

  describe('Template Input Validation', () => {
    it('should pass setupPricingModelSchema validation for usage-limit template', () => {
      expect(() =>
        validateSetupPricingModelInput(
          USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input
        )
      ).not.toThrow()
    })

    it('should pass setupPricingModelSchema validation for unlimited usage template', () => {
      expect(() =>
        validateSetupPricingModelInput(
          UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE.input
        )
      ).not.toThrow()
    })

    it('should have correct number of products for usage-limit template', () => {
      const template = USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input
      expect(template.products).toHaveLength(4)
      expect(template.products.map((p) => p.product.name)).toEqual([
        'Hobby',
        'Pro',
        'Pro+',
        'Ultra',
      ])
    })

    it('should have correct pricing for usage-limit template', () => {
      const hobbyProduct =
        USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input.products[0]
      expect(hobbyProduct.prices[0].unitPrice).toBe(0)

      const proProduct =
        USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input.products[1]
      expect(
        proProduct.prices.find((p) => p.slug === 'pro-monthly')
          ?.unitPrice
      ).toBe(2000)
      expect(
        proProduct.prices.find((p) => p.slug === 'pro-yearly')
          ?.unitPrice
      ).toBe(19200)
    })

    it('should have usage meters for usage-limit template', () => {
      expect(
        USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input.usageMeters
      ).toHaveLength(3)
      expect(
        USAGE_LIMIT_SUBSCRIPTION_TEMPLATE.input.usageMeters.map(
          (m) => m.slug
        )
      ).toEqual(['api-requests', 'ai-completions', 'storage-gb'])
    })

    it('should have no usage meters for unlimited usage template', () => {
      expect(
        UNLIMITED_USAGE_SUBSCRIPTION_TEMPLATE.input.usageMeters
      ).toHaveLength(0)
    })
  })

  describe('Template Lookup', () => {
    it('should find template by ID', () => {
      const template = getTemplateById('usage-limit-subscription')
      expect(template).toBeDefined()
      expect(template?.metadata.id).toBe('usage-limit-subscription')
    })

    it('should return undefined for non-existent template', () => {
      const template = getTemplateById('non-existent')
      expect(template).toBeUndefined()
    })
  })
})
