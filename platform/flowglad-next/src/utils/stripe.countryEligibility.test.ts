import { describe, expect, it } from 'vitest'
import { StripeConnectContractType } from '@/types'
import {
  cardPaymentsCountries,
  getEligibleFundsFlowsForCountry,
  isCountryEligibleForAnyFlow,
  isCountryEligibleForMoR,
  isCountryEligibleForPlatform,
  transferCountries,
} from './stripe'

const getPlatformEligibleCountryCode = (): string => {
  const platformEligibleCountryCode = cardPaymentsCountries.find(
    (countryCode) => countryCode.length > 0
  )

  if (!platformEligibleCountryCode) {
    throw new Error(
      'Expected cardPaymentsCountries to include at least one country.'
    )
  }

  return platformEligibleCountryCode
}

const getMoROnlyCountryCode = (): string => {
  const morOnlyCountryCode = transferCountries.find(
    (countryCode) => !cardPaymentsCountries.includes(countryCode)
  )

  if (!morOnlyCountryCode) {
    throw new Error(
      'Expected transferCountries to include at least one country not in cardPaymentsCountries.'
    )
  }

  return morOnlyCountryCode
}

const getCountryInBothLists = (): string | undefined => {
  return cardPaymentsCountries.find((countryCode) =>
    transferCountries.includes(countryCode)
  )
}

describe('stripe country eligibility helpers', () => {
  describe('isCountryEligibleForPlatform', () => {
    it('returns true for a country in cardPaymentsCountries', () => {
      const platformCountryCode = getPlatformEligibleCountryCode()
      expect(isCountryEligibleForPlatform(platformCountryCode)).toBe(
        true
      )
    })

    it('is case-insensitive', () => {
      const platformCountryCode = getPlatformEligibleCountryCode()
      expect(
        isCountryEligibleForPlatform(
          platformCountryCode.toLowerCase()
        )
      ).toBe(true)
    })

    it('returns false for a country not in cardPaymentsCountries', () => {
      const morOnlyCountryCode = getMoROnlyCountryCode()
      expect(isCountryEligibleForPlatform(morOnlyCountryCode)).toBe(
        false
      )
    })
  })

  describe('isCountryEligibleForMoR', () => {
    it('returns true for a country in transferCountries', () => {
      const morCountryCode = getMoROnlyCountryCode()
      expect(isCountryEligibleForMoR(morCountryCode)).toBe(true)
    })

    it('returns true for a country in cardPaymentsCountries', () => {
      const platformCountryCode = getPlatformEligibleCountryCode()
      expect(isCountryEligibleForMoR(platformCountryCode)).toBe(true)
    })

    it('is case-insensitive', () => {
      const morCountryCode = getMoROnlyCountryCode()
      expect(
        isCountryEligibleForMoR(morCountryCode.toLowerCase())
      ).toBe(true)
    })

    it('returns false for a country not in either eligibility list', () => {
      expect(isCountryEligibleForMoR('ZZ')).toBe(false)
    })
  })

  describe('getEligibleFundsFlowsForCountry', () => {
    it('returns both for a Platform-eligible country', () => {
      const platformCountryCode = getPlatformEligibleCountryCode()
      expect(
        getEligibleFundsFlowsForCountry(platformCountryCode)
      ).toEqual([
        StripeConnectContractType.Platform,
        StripeConnectContractType.MerchantOfRecord,
      ])
    })

    it('returns [MerchantOfRecord] for a MoR-only country', () => {
      const morOnlyCountryCode = getMoROnlyCountryCode()
      expect(
        getEligibleFundsFlowsForCountry(morOnlyCountryCode)
      ).toEqual([StripeConnectContractType.MerchantOfRecord])
    })

    it('returns both for a country in both lists (if one exists)', () => {
      const countryInBothLists = getCountryInBothLists()
      if (!countryInBothLists) {
        return
      }

      expect(
        getEligibleFundsFlowsForCountry(countryInBothLists)
      ).toEqual([
        StripeConnectContractType.Platform,
        StripeConnectContractType.MerchantOfRecord,
      ])
    })

    it('returns empty array for unknown country code', () => {
      expect(getEligibleFundsFlowsForCountry('ZZ')).toEqual([])
    })

    it('treats whitespace-only and unknown codes as empty', () => {
      expect(getEligibleFundsFlowsForCountry('  zz  ')).toEqual([])
    })
  })

  describe('isCountryEligibleForAnyFlow', () => {
    it('returns true for countries in cardPaymentsCountries', () => {
      const platformOnlyCountryCode = getPlatformEligibleCountryCode()
      expect(
        isCountryEligibleForAnyFlow(platformOnlyCountryCode)
      ).toBe(true)
    })

    it('returns true for countries in transferCountries', () => {
      const morOnlyCountryCode = getMoROnlyCountryCode()
      expect(isCountryEligibleForAnyFlow(morOnlyCountryCode)).toBe(
        true
      )
    })

    it('returns false for countries in neither list', () => {
      expect(isCountryEligibleForAnyFlow('ZZ')).toBe(false)
    })

    it('is case-insensitive', () => {
      const platformOnlyCountryCode = getPlatformEligibleCountryCode()
      expect(
        isCountryEligibleForAnyFlow(
          platformOnlyCountryCode.toLowerCase()
        )
      ).toBe(true)
    })
  })
})
