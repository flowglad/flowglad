import { describe, expect, it } from 'bun:test'
import { addSubscriptionFeatureFormSchema } from './addSubscriptionFeatureFormSchema'

describe('addSubscriptionFeatureFormSchema', () => {
  it('validates required fields', () => {
    const result = addSubscriptionFeatureFormSchema.safeParse({
      id: 'sub_123',
      featureId: 'feature_123',
      grantCreditsImmediately: false,
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing subscription id', () => {
    const result = addSubscriptionFeatureFormSchema.safeParse({
      id: '',
      featureId: 'feature_123',
      grantCreditsImmediately: false,
    })
    expect(result.success).toBe(false)
  })
})
