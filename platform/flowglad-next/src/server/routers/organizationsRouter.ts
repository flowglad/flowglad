import { router } from '@/server/trpc'
import { protectedProcedure } from '@/server/trpc'
import {
  authenticatedTransaction,
  adminTransaction,
} from '@/db/databaseMethods'
import {
  selectMembershipsAndUsersByMembershipWhere,
  selectFocusedMembershipAndOrganization,
} from '@/db/tableMethods/membershipMethods'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { selectRevenueDataForOrganization } from '@/db/tableMethods/paymentMethods'
import {
  createOrganizationSchema,
  organizationsClientSelectSchema,
  editOrganizationSchema,
} from '@/db/schema/organizations'
import { getRevenueDataInputSchema } from '@/db/schema/payments'
import { customAlphabet } from 'nanoid'
import { z } from 'zod'
import { createOrganizationTransaction } from '@/utils/organizationHelpers'
import { stackServerApp } from '@/stack'
import { requestStripeConnectOnboardingLink } from '@/server/mutations/requestStripeConnectOnboardingLink'

const generateSubdomainSlug = (name: string) => {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphen
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
      .slice(0, 50) // Enforce max length - 63 is the max for subdomains, but we'll be using 50 to make room for distinguishing suffix
      .replace(/^[^a-z0-9]+/, '') // Ensure starts with alphanumeric
      .replace(/[^a-z0-9]+$/, '') || // Ensure ends with alphanumeric
    'invalid-subdomain'
  ) // Fallback if result is empty
}

const mininanoid = customAlphabet(
  'abcdefghijklmnopqrstuvwxyz0123456789',
  6
)

const getMembers = protectedProcedure.query(async ({ ctx }) => {
  if (!ctx.organizationId) {
    throw new Error('organizationId is required')
  }

  const members = await authenticatedTransaction(
    async ({ transaction }) => {
      return selectMembershipsAndUsersByMembershipWhere(
        { organizationId: ctx.organizationId },
        transaction
      )
    }
  )

  return {
    data: { members },
  }
})

const getFocusedMembership = protectedProcedure.query(async () => {
  const focusedMembership = await authenticatedTransaction(
    async ({ transaction, userId }) => {
      return selectFocusedMembershipAndOrganization(
        userId,
        transaction
      )
    }
  )
  return focusedMembership
})

const getRevenueData = protectedProcedure
  .input(getRevenueDataInputSchema)
  .query(async ({ input }) => {
    return authenticatedTransaction(async ({ transaction }) => {
      return selectRevenueDataForOrganization(input, transaction)
    })
  })

const createOrganization = protectedProcedure
  .input(createOrganizationSchema)
  .output(
    z.object({
      organization: organizationsClientSelectSchema,
    })
  )
  .mutation(async ({ input }) => {
    const user = await stackServerApp.getUser()

    if (!user) {
      throw new Error('User not found')
    }
    const email = user.primaryEmail
    const userId = user.id
    if (!email) {
      throw new Error('User email not found')
    }

    const result = await adminTransaction(async ({ transaction }) => {
      return createOrganizationTransaction(
        input,
        {
          id: userId,
          email,
          fullName: user.displayName ?? undefined,
        },
        transaction
      )
    })

    return {
      organization: result.organization,
    }
  })

const editOrganization = protectedProcedure
  .input(editOrganizationSchema)
  .mutation(async ({ input }) => {
    return authenticatedTransaction(
      async ({ transaction, userId }) => {
        const { organization } = input
        await updateOrganization(organization, transaction)
        return {
          data: organization,
        }
      }
    )
  })

export const organizationsRouter = router({
  create: createOrganization,
  update: editOrganization,
  requestStripeConnect: requestStripeConnectOnboardingLink,
  getMembers: getMembers,
  getFocusedMembership: getFocusedMembership,
  // Revenue is a sub-resource of organizations
  getRevenue: getRevenueData,
})
