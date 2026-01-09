import { describe, expect, it } from 'vitest'
import { PriceType } from '@/types'
import { validateSetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'
import {
  getTemplateById,
  PRICING_MODEL_TEMPLATES,
} from './pricingModelTemplates'

describe('Pricing Model Templates', () => {
  describe('Template Input Validation', () => {
    it('should validate all template inputs', () => {
      PRICING_MODEL_TEMPLATES.forEach((template) => {
        const validated = validateSetupPricingModelInput(
          template.input
        )
        expect(validated).toBeDefined()
      })
    })
  })

  describe('Template Lookup', () => {
    it('should find all templates by their IDs', () => {
      const templateIds = [
        'usage_limit_subscription',
        'unlimited_usage_subscription',
        'ai_image_generation_subscription',
        'seat_based_subscription',
        'ai_meeting_notes_subscription',
        'ai_token_usage',
      ]

      templateIds.forEach((id) => {
        const template = getTemplateById(id)
        expect(template).toBeDefined()
        expect(template?.metadata.id).toBe(id)
      })
    })

    it('should return undefined for non-existent template', () => {
      const template = getTemplateById('non-existent')
      expect(template).toBeUndefined()
    })
  })

  describe('Usage Meters and Pricing', () => {
    // PR 5: Usage prices now belong to usage meters, not products
    it('should have at least one usage type price for each usage meter', () => {
      PRICING_MODEL_TEMPLATES.forEach((template) => {
        const { usageMeters } = template.input

        // Only validate templates that have usage meters
        if (usageMeters.length === 0) {
          return
        }

        // PR 5: Each usage meter should have nested prices
        usageMeters.forEach((meter) => {
          const meterSlug = meter.usageMeter.slug
          const meterPrices = meter.prices ?? []

          expect(
            meterPrices.length,
            `Template "${template.metadata.id}" has usage meter "${meterSlug}" but no usage type prices nested under it`
          ).toBeGreaterThan(0)

          // Verify all prices are usage type
          meterPrices.forEach((price) => {
            expect(
              price.type,
              `Template "${template.metadata.id}" has non-usage price type under usage meter "${meterSlug}"`
            ).toBe(PriceType.Usage)
          })
        })
      })
    })
  })
})
