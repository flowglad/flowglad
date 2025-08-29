import { Organization } from '@/db/schema/organizations'
import { BusinessOnboardingStatus, CurrencyCode, StripeConnectContractType } from '@/types'

export const dummyOrganization: Organization.Record = {
  id: '1',
  createdAt: new Date(),
  updatedAt: new Date(),
  name: 'Test Organization',
  stripeAccountId: 'acct_123456',
  subdomainSlug: 'test-org',
  domain: 'testorg.com',
  countryId: '1',
  logoURL: null,
  tagline: null,
  payoutsEnabled: false,
  onboardingStatus: BusinessOnboardingStatus.PartiallyOnboarded,
  feePercentage: '0',
  stripeConnectContractType:
    StripeConnectContractType.MerchantOfRecord,
  defaultCurrency: CurrencyCode.USD,
  billingAddress: null,
  contactEmail: null,
  featureFlags: {},
  allowMultipleSubscriptionsPerCustomer: false,
  externalId: '___',
  createdByCommit: 'test',
  updatedByCommit: 'test',
  position: 0,
  securitySalt: 'lol',
  monthlyBillingVolumeFreeTier: 100000,
  upfrontProcessingCredits: 0,
}
