import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { innerSetReferralSelectionHandler } from './setReferralSelection'
import { REFERRAL_OPTIONS } from '@/utils/referrals'
import { setReferralSelection as setReferralSelectionInRedis } from '@/utils/redis'
import { setupOrg, setupUserAndApiKey, teardownOrg } from '@/../seedDatabase'
import { Organization } from '@/db/schema/organizations'

describe('innerSetReferralSelectionHandler', () => {
  let organization: Organization.Record
  let userId: string

  beforeEach(async () => {
    const orgData = await setupOrg()
    organization = orgData.organization
    const { user } = await setupUserAndApiKey({
      organizationId: organization.id,
      livemode: true,
    })
    userId = user.id
  })

  afterEach(async () => {
    await teardownOrg({ organizationId: organization.id })
  })

  it('stores a valid referral selection for a user', async () => {
    const source = REFERRAL_OPTIONS[0]
    const result = await innerSetReferralSelectionHandler({
      userId,
      source,
    })
    expect(result).toEqual({ success: true })
  })

  it('accepts any allowed referral option', async () => {
    for (const source of REFERRAL_OPTIONS) {
      const result = await innerSetReferralSelectionHandler({ userId, source })
      expect(result).toEqual({ success: true })
    }
  })
})


