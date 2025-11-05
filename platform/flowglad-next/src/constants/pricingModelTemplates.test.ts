import { describe, it, expect } from 'vitest'
import {
  PRICING_MODEL_TEMPLATES,
  getTemplateById,
} from './pricingModelTemplates'
import { validateSetupPricingModelInput } from '@/utils/pricingModels/setupSchemas'

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
})
