import { describe, it, expect } from 'vitest'
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
