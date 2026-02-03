import { describe, expect, it } from 'bun:test'
import {
  type EditPricingModelWithStructureInput,
  editPricingModelWithStructureSchema,
  hasStructureFields,
} from './editSchemas'

describe('editPricingModelWithStructureSchema', () => {
  it('parses valid input with only required fields', () => {
    const input = {
      id: 'pm_123',
      pricingModel: { id: 'pm_123', name: 'Test Model' },
    }
    const result =
      editPricingModelWithStructureSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('parses valid input with structure fields', () => {
    const input = {
      id: 'pm_123',
      pricingModel: {
        id: 'pm_123',
        name: 'Test Model',
        features: [],
        products: [],
        usageMeters: [],
        resources: [],
      },
    }
    const result =
      editPricingModelWithStructureSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects input with empty name', () => {
    const input = {
      id: 'pm_123',
      pricingModel: { id: 'pm_123', name: '' },
    }
    const result =
      editPricingModelWithStructureSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})

describe('hasStructureFields', () => {
  const baseInput: EditPricingModelWithStructureInput = {
    id: 'pm_123',
    pricingModel: { id: 'pm_123', name: 'Test Model' },
  }

  it('returns false when no structure fields are present', () => {
    const result = hasStructureFields(baseInput)
    expect(result).toBe(false)
  })

  it('returns true when features array is present (even if empty)', () => {
    const input: EditPricingModelWithStructureInput = {
      ...baseInput,
      pricingModel: { ...baseInput.pricingModel, features: [] },
    }
    const result = hasStructureFields(input)
    expect(result).toBe(true)
  })

  it('returns true when products array is present', () => {
    const input: EditPricingModelWithStructureInput = {
      ...baseInput,
      pricingModel: { ...baseInput.pricingModel, products: [] },
    }
    const result = hasStructureFields(input)
    expect(result).toBe(true)
  })

  it('returns true when usageMeters array is present', () => {
    const input: EditPricingModelWithStructureInput = {
      ...baseInput,
      pricingModel: { ...baseInput.pricingModel, usageMeters: [] },
    }
    const result = hasStructureFields(input)
    expect(result).toBe(true)
  })

  it('returns true when resources array is present', () => {
    const input: EditPricingModelWithStructureInput = {
      ...baseInput,
      pricingModel: { ...baseInput.pricingModel, resources: [] },
    }
    const result = hasStructureFields(input)
    expect(result).toBe(true)
  })

  it('returns true when multiple structure fields are present', () => {
    const input: EditPricingModelWithStructureInput = {
      ...baseInput,
      pricingModel: {
        ...baseInput.pricingModel,
        features: [],
        products: [],
      },
    }
    const result = hasStructureFields(input)
    expect(result).toBe(true)
  })
})
