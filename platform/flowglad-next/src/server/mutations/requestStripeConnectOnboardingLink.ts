import { protectedProcedure } from '@/server/trpc'
import { BusinessOnboardingStatus } from '@/types'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import {
  createConnectedAccount,
  createAccountOnboardingLink,
} from '@/utils/stripe'
import { selectCountryById } from '@/db/tableMethods/countryMethods'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { requestStripeConnectOnboardingLinkInputSchema } from '@/db/schema/countries'

export const requestStripeConnectOnboardingLink = protectedProcedure
  .input(requestStripeConnectOnboardingLinkInputSchema)
  .mutation(async ({ input, ctx }) => {
    const { organization, country } = await authenticatedTransaction(
      async ({ transaction, userId }) => {
        const [membership] = await selectMembershipAndOrganizations(
          {
            userId,
            focused: true,
          },
          transaction
        )

        if (!membership) {
          throw new Error('No memberships found for this user')
        }

        const organization = membership.organization

        if (!organization) {
          throw new Error('Organization not found')
        }
        const country = await selectCountryById(
          input.CountryId,
          transaction
        )

        return { organization, country }
      }
    )

    let stripeAccountId = organization.stripeAccountId

    if (
      !stripeAccountId ||
      stripeAccountId.startsWith('PLACEHOLDER')
    ) {
      const stripeAccount = await createConnectedAccount({
        countryCode: country.code,
        organization,
        // force livemode to avoid stripe attempting to connect
        // to our platform in test mode.
        livemode: true,
      })
      stripeAccountId = stripeAccount.id
    }

    const onboardingLink = await createAccountOnboardingLink(
      stripeAccountId,
      // force livemode to avoid stripe attempting to connect
      // to our platform in test mode.
      true
    )

    await adminTransaction(
      async ({ transaction }) => {
        const updatedOrganization = await updateOrganization(
          {
            ...organization,
            countryId: country.id,
          },
          transaction
        )
        await updateOrganization(
          {
            ...updatedOrganization,
            stripeAccountId,
            countryId: country.id,
            onboardingStatus:
              BusinessOnboardingStatus.PartiallyOnboarded,
          },
          transaction
        )
      },
      { livemode: true }
    )

    return {
      onboardingLink,
    }
  })
