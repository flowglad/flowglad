import { protectedProcedure } from '@/server/trpc'
import {
  adminTransaction,
  authenticatedTransaction,
} from '@/db/databaseMethods'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import core from '@/utils/core'
import {
  selectOrganizationById,
  updateOrganization,
} from '@/db/tableMethods/organizationMethods'
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
        const organization = await selectOrganizationById(
          input.organizationId,
          transaction
        )

        return organization
      }
    )
    if (!organization) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Organization not found',
      })
    }

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
