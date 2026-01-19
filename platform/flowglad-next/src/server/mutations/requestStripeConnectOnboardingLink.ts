import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { requestStripeConnectOnboardingLinkInputSchema } from '@/db/schema/countries'
import { selectCountryById } from '@/db/tableMethods/countryMethods'
import { selectMembershipAndOrganizations } from '@/db/tableMethods/membershipMethods'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { protectedProcedure } from '@/server/trpc'
import { BusinessOnboardingStatus } from '@/types'
import {
  createAccountOnboardingLink,
  createConnectedAccount,
} from '@/utils/stripe'

export const requestStripeConnectOnboardingLink = protectedProcedure
  .input(requestStripeConnectOnboardingLinkInputSchema)
  .mutation(async () => {
    const { organization, country } = (
      await authenticatedTransaction(
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

          if (!organization.countryId) {
            throw new Error(
              'Country is required before you can enable payments.'
            )
          }

          const country = await selectCountryById(
            organization.countryId,
            transaction
          )

          if (!country) {
            throw new Error('Country not found')
          }

          return { organization, country }
        }
      )
    ).unwrap()

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

    ;(
      await adminTransaction(
        async ({ transaction }) => {
          await updateOrganization(
            {
              ...organization,
              stripeAccountId,
              onboardingStatus:
                BusinessOnboardingStatus.PartiallyOnboarded,
            },
            transaction
          )
        },
        { livemode: true }
      )
    ).unwrap()

    return {
      onboardingLink,
    }
  })
