import { describe, it, expect } from 'vitest'
import { core } from '@/utils/core'

describe('billingPortalPageURL', () => {
  it('creates correct URL for manage page', () => {
    const url = core.billingPortalPageURL({
      organizationId: 'organizationid',
      customerExternalId: 'customerexternalid',
      page: 'manage',
    })
    expect(url).toBe(
      'http://localhost:3000/p/organizationid/customerexternalid/manage'
    )
  })

  it('creates correct URL for sign-in page', () => {
    const url = core.billingPortalPageURL({
      organizationId: 'organizationid',
      customerExternalId: 'customerexternalid',
      page: 'sign-in',
    })
    expect(url).toBe(
      'http://localhost:3000/p/organizationid/customerexternalid/sign-in'
    )
  })

  it('creates correct URL for validate-magic-link page', () => {
    const url = core.billingPortalPageURL({
      organizationId: 'organizationid',
      customerExternalId: 'customerexternalid',
      page: 'validate-magic-link',
    })
    expect(url).toBe(
      'http://localhost:3000/api/organizationid/customerexternalid/validate-magic-link'
    )
  })
})
