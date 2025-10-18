import { CountryCode } from '@/types'
import { validateStripeCountrySupport } from '@/utils/stripe'

const testStripeValidation = () => {
  const mockTests = [
    { country: 'US', shouldPass: true },
    { country: 'DE', shouldPass: true },
    { country: 'XX', shouldPass: false },
    { country: 'AF', shouldPass: false },
  ]

  for (const test of mockTests) {
    try {
      validateStripeCountrySupport(test.country as CountryCode)
      console.log(
        `✅ ${test.country}: ${test.shouldPass ? 'PASS' : 'UNEXPECTED PASS'}`
      )
    } catch (error: any) {
      console.log(
        `❌ ${test.country}: ${test.shouldPass ? 'UNEXPECTED FAIL' : 'PASS'} - ${error.message}`
      )
    }
  }
}
