import { describe, expect, it } from 'bun:test'
import { addSubscriptionFeatureFormSchema } from './addSubscriptionFeatureFormSchema'

describe('addSubscriptionFeatureFormSchema', () => {
  it('validates required fields', () => {
    const result = addSubscriptionFeatureFormSchema.safeParse({
      subscriptionItemId: 'si_123',
      featureId: 'feature_123',
      grantCreditsImmediately: false,
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing subscription item id', () => {
    const result = addSubscriptionFeatureFormSchema.safeParse({
      subscriptionItemId: '',
      featureId: 'feature_123',
      grantCreditsImmediately: false,
    })
    expect(result.success).toBe(false)
  })
})
