import { redirect } from 'next/navigation'
import { ClientAuthGuard } from '@/components/ClientAuthGuard'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import type { ApiKey } from '@/db/schema/apiKeys'
import { selectApiKeys } from '@/db/tableMethods/apiKeyMethods'
import { selectAllCountries } from '@/db/tableMethods/countryMethods'
import { selectDiscounts } from '@/db/tableMethods/discountMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { selectPricesAndProductsForOrganization } from '@/db/tableMethods/priceMethods'
import { selectPricingModels } from '@/db/tableMethods/pricingModelMethods'
import { selectUsers } from '@/db/tableMethods/userMethods'
import {
  BusinessOnboardingStatus,
  FlowgladApiKeyType,
  type OnboardingChecklistItem,
  OnboardingItemType,
} from '@/types'
import { createSecretApiKeyTransaction } from '@/utils/apiKeyHelpers'
import { auth, getSession } from '@/utils/auth'
import { updateOrganizationOnboardingStatus } from '@/utils/processStripeEvents'
import OnboardingStatusTable from './OnboardingStatusTable'

const OnboardingPage = async () => {
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
      const pricingModels = await selectPricingModels(
        { organizationId: organization.id },
        transaction
      )
      return {
        organization,
        countries,
        products,
        discounts,
        pricingModels,
      }
    }
  )
  const { countries } = results

  if (!results.organization) {
    return redirect('/onboarding/business-details')
  }
  let organization = results.organization
  const testmodeApiKeys: ApiKey.Record[] = await adminTransaction(
    async ({ transaction }) => {
      return selectApiKeys(
        { organizationId: organization.id, livemode: false },
        transaction
      )
    }
  )
  let secretApiKey: ApiKey.Record | undefined = testmodeApiKeys.find(
    (key) => key.type === FlowgladApiKeyType.Secret
  )
  const session = await getSession()

  if (!secretApiKey) {
    const betterAuthId = session?.user.id
    if (!betterAuthId) {
      throw new Error('User not found')
    }
    secretApiKey = await adminTransaction(
      async ({ transaction }): Promise<ApiKey.Record> => {
        const [user] = await selectUsers(
          {
            betterAuthId,
          },
          transaction
        )
        const { apiKey } = await createSecretApiKeyTransaction(
          {
            apiKey: {
              name: 'Secret Testmode Key',
              type: FlowgladApiKeyType.Secret,
            },
          },
          {
            transaction,
            livemode: false,
            userId: user!.id,
            organizationId: organization.id,
          }
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
    // {
    //   title: 'Create your first product',
    //   description: `Make the first product you'll sell to your customers.`,
    //   completed: Boolean(products && products.length > 0),
    //   action: 'Create Product',
    //   type: OnboardingItemType.Product,
    // },
    // {
    //   title: 'Add a discount',
    //   description:
    //     'Close customers who are on the fence with a discount',
    //   completed: Boolean(discounts && discounts.length > 0),
    //   action: 'Create Discount',
    //   type: OnboardingItemType.Discount,
    // },
    {
      title: 'Enable Payments',
      description: 'Set up Stripe Connect to process payments',
      completed: organization.payoutsEnabled,
      inReview:
        organization.onboardingStatus ===
          BusinessOnboardingStatus.FullyOnboarded &&
        !organization.payoutsEnabled,
      action: 'Connect',
      type: OnboardingItemType.Stripe,
    },
  ]
  return (
    <ClientAuthGuard
      requireAuth={true}
      requireOrganization={true}
      redirectTo="/onboarding/business-details"
    >
      <div className="flex flex-col gap-4 p-4 w-full justify-center items-start m-auto max-w-[416px] min-h-svh">
        <div className="flex flex-col items-start justify-center w-full gap-4">
          <div className="flex flex-col items-start justify-center gap-1 p-2">
            <h2 className="text-xl font-semibold">
              Integrate Flowglad
            </h2>
            <p className="text-sm text-foreground">
              Complete these steps to start accepting payments.
            </p>
          </div>
          <OnboardingStatusTable
            onboardingChecklistItems={onboardingChecklistItems}
            countries={countries}
            secretApiKey={secretApiKey.token}
            pricingModelsCount={results.pricingModels?.length ?? 0}
          />
        </div>
      </div>
    </ClientAuthGuard>
  )
}

export default OnboardingPage
