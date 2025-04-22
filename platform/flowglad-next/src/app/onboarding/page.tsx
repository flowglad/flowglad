import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/databaseMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import {
  FlowgladApiKeyType,
  OnboardingChecklistItem,
  OnboardingItemType,
} from '@/types'
import { updateOrganizationOnboardingStatus } from '@/utils/processStripeEvents'
import { selectAllCountries } from '@/db/tableMethods/countryMethods'
import OnboardingStatusTable from './OnboardingStatusTable'
import { selectPricesAndProductsForOrganization } from '@/db/tableMethods/priceMethods'
import { selectDiscounts } from '@/db/tableMethods/discountMethods'
import { redirect } from 'next/navigation'
import { selectApiKeys } from '@/db/tableMethods/apiKeyMethods'
import { createApiKeyTransaction } from '@/utils/apiKeyHelpers'
import { ApiKey } from '@/db/schema/apiKeys'
import { stackServerApp } from '@/stack'

const OnboardingPage = async () => {
  const user = await stackServerApp.getUser()
  const results = await authenticatedTransaction(
    async ({ transaction, userId }) => {
      const membershipsAndOrganizations =
        await selectMembershipAndOrganizations(
          {
            userId,
            focused: true,
          },
          transaction
        )
      const countries = await selectAllCountries(transaction)
      if (membershipsAndOrganizations.length === 0) {
        return { countries }
      }
      const organization = membershipsAndOrganizations[0].organization
      const products = await selectPricesAndProductsForOrganization(
        {},
        organization.id,
        transaction
      )
      const discounts = await selectDiscounts(
        { organizationId: organization.id },
        transaction
      )
      return { organization, countries, products, discounts }
    }
  )
  const { countries } = results

  if (!results.organization) {
    return redirect('/onboarding/business-details')
  }
  let organization = results.organization
  const testmodeApiKeys = await adminTransaction(
    async ({ transaction }) => {
      return selectApiKeys(
        { organizationId: organization.id, livemode: false },
        transaction
      )
    }
  )
  let publishableApiKey = testmodeApiKeys.find(
    (key) => key.type === FlowgladApiKeyType.Publishable
  )
  let secretApiKey = testmodeApiKeys.find(
    (key) => key.type === FlowgladApiKeyType.Secret
  )
  if (!publishableApiKey) {
    publishableApiKey = await adminTransaction(
      async ({ transaction }): Promise<ApiKey.Record> => {
        const { apiKey } = await createApiKeyTransaction(
          {
            apiKey: {
              name: 'Publishable Testmode Key',
              type: FlowgladApiKeyType.Publishable,
            },
          },
          { transaction, livemode: false, userId: user!.id }
        )
        return apiKey
      }
    )
  }
  if (!secretApiKey) {
    secretApiKey = await adminTransaction(
      async ({ transaction }): Promise<ApiKey.Record> => {
        const { apiKey } = await createApiKeyTransaction(
          {
            apiKey: {
              name: 'Secret Testmode Key',
              type: FlowgladApiKeyType.Secret,
            },
          },
          { transaction, livemode: false, userId: user!.id }
        )
        return apiKey
      }
    )
  }
  /**
   * Sync the organization's payouts enabled status if they have a stripe account
   */
  const stripeAccountId = organization.stripeAccountId
  const payoutsEnabled = organization.payoutsEnabled
  if (stripeAccountId && !payoutsEnabled) {
    const updateStatusResult =
      await updateOrganizationOnboardingStatus(
        organization.stripeAccountId,
        true
      )
    if (updateStatusResult) {
      organization = updateStatusResult.organization
    }
  }

  const onboardingChecklistItems: OnboardingChecklistItem[] = [
    {
      title: 'Connect your Stripe account',
      description:
        'Verify identity and connect your bank to receive payments.',
      completed: organization.payoutsEnabled,
      action: 'Connect Stripe',
      type: OnboardingItemType.Stripe,
    },
  ]

  return (
    <div className="flex flex-col gap-4 p-8 w-full justify-center items-center m-auto max-w-2xl">
      <div className="flex flex-col items-center justify-center w-full gap-8">
        <div className="flex flex-col items-center justify-center gap-2">
          <h2 className="text-2xl font-semibold">Set Up</h2>
          <p className="text-md text-foreground">
            Complete just a few steps to get up and running.
          </p>
        </div>
        <OnboardingStatusTable
          onboardingChecklistItems={onboardingChecklistItems}
          countries={countries}
          publishableApiKey={publishableApiKey.token}
          secretApiKey={secretApiKey.token}
        />
      </div>
    </div>
  )
}

export default OnboardingPage