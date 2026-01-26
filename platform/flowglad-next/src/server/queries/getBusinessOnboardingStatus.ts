import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  selectOrganizationById,
  updateOrganization,
} from '@/db/tableMethods/organizationMethods'
import { protectedProcedure } from '@/server/trpc'
import { BusinessOnboardingStatus } from '@/types'
import { getConnectedAccountOnboardingStatus } from '@/utils/stripe'

export const getBusinessOnboardingStatus = protectedProcedure
  .input(
    z.object({
      organizationId: z.string(),
    })
  )
  .query(async ({ input, ctx }) => {
    const organization = await authenticatedTransaction(
      async ({ transaction }) => {
        const organization = (
          await selectOrganizationById(
            input.organizationId,
            transaction
          )
        ).unwrap()

        return organization
      }
    )

    if (
      organization.stripeAccountId &&
      organization.onboardingStatus !==
        BusinessOnboardingStatus.FullyOnboarded
    ) {
      const stripeOnboardingDetails =
        await getConnectedAccountOnboardingStatus(
          organization.stripeAccountId,
          ctx.livemode
        )
      await adminTransaction(async ({ transaction }) => {
        await updateOrganization(
          {
            id: organization.id,
            onboardingStatus:
              stripeOnboardingDetails.onboardingStatus,
            payoutsEnabled: stripeOnboardingDetails.payoutsEnabled,
          },
          transaction
        )
      })
      return
    }

    return organization.onboardingStatus
  })
