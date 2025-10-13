import { core } from '@/utils/core'

describe('customerBillingPortalURL', () => {
  it('creates correct URL for billing portal with customerId', () => {
    const url = core.customerBillingPortalURL({
      organizationId: 'organizationid',
      customerId: 'customerid',
    })
    expect(url).toBe(
      'http://localhost:3000/billing-portal/organizationid/customerid'
    )
  })

  it('creates correct URL for billing portal without customerId', () => {
    const url = core.customerBillingPortalURL({
      organizationId: 'organizationid',
    })
    expect(url).toBe(
      'http://localhost:3000/billing-portal/organizationid/'
    )
  })
})

describe('organizationBillingPortalURL', () => {
  it('creates correct URL for billing portal with organization ID only', () => {
    const url = core.organizationBillingPortalURL({
      organizationId: 'organizationid',
    })
    expect(url).toBe(
      'http://localhost:3000/billing-portal/organizationid'
    )
  })
})

describe('safeZodNullOrUndefined', () => {
  it('should return null for null', () => {
    const result = core.safeZodNullOrUndefined.parse(null)
    expect(result).toBe(null)
  })
  it('should return null for undefined', () => {
    const result = core.safeZodNullOrUndefined.parse(undefined)
    expect(result).toBe(null)
  })
})
