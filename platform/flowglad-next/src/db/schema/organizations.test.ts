import { describe, it, expect } from 'vitest'
import { billingAddressSchema } from './organizations'

describe('billing address schema parser', () => {
  it('should parse nested billing address input', () => {
    const input = {
      name: '___ ____',
      email: '_____@gmail.com',
      address: {
        name: '___ ____',
        city: '___ ____',
        line1: '___ ____',
        line2: null,
        state: '___ ____',
        country: 'US',
        postal_code: '___ ____',
      },
    }
    const output = billingAddressSchema.safeParse(input)
    expect(output.success).toBe(true)
    expect(output.data).toEqual(input)
  })
})
