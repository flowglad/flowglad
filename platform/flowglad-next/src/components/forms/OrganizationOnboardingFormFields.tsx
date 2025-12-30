'use client'

import type { useState } from 'react'
import OrganizationFormFields from '@/components/forms/OrganizationFormFields'
import type { ReferralOption } from '@/utils/referrals'

const OrganizationOnboardingFormFields = ({
  setReferralSource,
  referralSource,
}: {
  setReferralSource?: ReturnType<
    typeof useState<ReferralOption | undefined>
  >[1]
  referralSource?: ReferralOption
}) => {
  return (
    <OrganizationFormFields
      setReferralSource={setReferralSource}
      referralSource={referralSource}
    />
  )
}

export default OrganizationOnboardingFormFields
