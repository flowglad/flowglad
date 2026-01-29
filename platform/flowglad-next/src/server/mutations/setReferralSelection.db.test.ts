import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import type { Organization } from '@db-core/schema/organizations'
import {
  setupOrg,
  setupUserAndApiKey,
  teardownOrg,
} from '@/../seedDatabase'
import { setReferralSelection as setReferralSelectionInRedis } from '@/utils/redis'
import { REFERRAL_OPTIONS } from '@/utils/referrals'
import { innerSetReferralSelectionHandler } from './setReferralSelection'

describe('innerSetReferralSelectionHandler', () => {
  let organization: Organization.Record

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
  })

  afterEach(async () => {
    await teardownOrg({ organizationId: organization.id })
  })

  it('stores a valid referral selection for an organization', async () => {
    const source = REFERRAL_OPTIONS[0]
    const result = await innerSetReferralSelectionHandler({
      organizationId: organization.id,
      source,
    })
    expect(result).toEqual({ success: true })
  })

  it('accepts any allowed referral option', async () => {
    for (const source of REFERRAL_OPTIONS) {
      const result = await innerSetReferralSelectionHandler({
        organizationId: organization.id,
        source,
      })
      expect(result).toEqual({ success: true })
    }
  })
})
