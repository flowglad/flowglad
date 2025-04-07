import { router } from '@/server/trpc'
import { protectedProcedure } from '@/server/trpc'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/databaseMethods'
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
import { inviteUserToOrganization } from '../mutations/inviteUserToOrganization'
import {
  calculateMRRByMonth,
  calculateMRRBreakdown,
  calculateARR,
  MonthlyRecurringRevenue,
  MRRBreakdown,
  RevenueCalculationOptions,
} from '@/utils/billing-dashboard/revenueCalculationHelpers'
import {
  calculateActiveSubscribersByMonth,
  calculateSubscriberBreakdown,
  getCurrentActiveSubscribers,
  MonthlyActiveSubscribers,
  SubscriberBreakdown,
  SubscriberCalculationOptions,
} from '@/utils/billing-dashboard/subscriberCalculationHelpers'
import { RevenueChartIntervalUnit } from '@/types'

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

const getMembers = protectedProcedure.query(async ({ ctx }) => {
  if (!ctx.organizationId) {
    throw new Error('organizationId is required')
  }
  const members = await adminTransaction(async ({ transaction }) => {
    return selectMembershipsAndUsersByMembershipWhere(
      { organizationId: ctx.organizationId },
      transaction
    )
  })

  return {
    /**
     * Sort members by date of creation, newest first
     */
    members: members.sort((a, b) => {
      return (
        new Date(b.membership.createdAt).getTime() -
        new Date(a.membership.createdAt).getTime()
      )
    }),
  }
})

const getFocusedMembership = protectedProcedure.query(
  async ({ ctx }) => {
    const focusedMembership = await authenticatedTransaction(
      async ({ transaction, userId }) => {
        return selectFocusedMembershipAndOrganization(
          userId,
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )
    return focusedMembership
  }
)

const getRevenueData = protectedProcedure
  .input(getRevenueDataInputSchema)
  .query(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction }) => {
        return selectRevenueDataForOrganization(input, transaction)
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getMRRCalculationInputSchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
  granularity: z.nativeEnum(RevenueChartIntervalUnit),
})

const getMRR = protectedProcedure
  .input(getMRRCalculationInputSchema)
  .query(async ({ input, ctx }) => {
    if (!ctx.organizationId) {
      throw new Error('organizationId is required')
    }

    return authenticatedTransaction(
      async ({ transaction }) => {
        return calculateMRRByMonth(
          ctx.organizationId!,
          input,
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getARR = protectedProcedure.query(async ({ ctx }) => {
  if (!ctx.organizationId) {
    throw new Error('organizationId is required')
  }

  return authenticatedTransaction(
    async ({ transaction }) => {
      return calculateARR(ctx.organizationId!, transaction)
    },
    {
      apiKey: ctx.apiKey,
    }
  )
})

const getMRRBreakdownInputSchema = z.object({
  currentMonth: z.date(),
  previousMonth: z.date(),
})

const getMRRBreakdown = protectedProcedure
  .input(getMRRBreakdownInputSchema)
  .query(async ({ input, ctx }) => {
    if (!ctx.organizationId) {
      throw new Error('organizationId is required')
    }

    return authenticatedTransaction(
      async ({ transaction }) => {
        return calculateMRRBreakdown(
          ctx.organizationId!,
          input.currentMonth,
          input.previousMonth,
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getActiveSubscribersInputSchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
  granularity: z.nativeEnum(RevenueChartIntervalUnit),
})

const getActiveSubscribers = protectedProcedure
  .input(getActiveSubscribersInputSchema)
  .query(async ({ input, ctx }) => {
    if (!ctx.organizationId) {
      throw new Error('organizationId is required')
    }

    return authenticatedTransaction(
      async ({ transaction }) => {
        return calculateActiveSubscribersByMonth(
          ctx.organizationId!,
          input,
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getSubscriberBreakdownInputSchema = z.object({
  currentMonth: z.date(),
  previousMonth: z.date(),
})

const getSubscriberBreakdown = protectedProcedure
  .input(getSubscriberBreakdownInputSchema)
  .query(async ({ input, ctx }) => {
    if (!ctx.organizationId) {
      throw new Error('organizationId is required')
    }

    return authenticatedTransaction(
      async ({ transaction }) => {
        return calculateSubscriberBreakdown(
          ctx.organizationId!,
          input.currentMonth,
          input.previousMonth,
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

const getCurrentSubscribers = protectedProcedure.query(
  async ({ ctx }) => {
    if (!ctx.organizationId) {
      throw new Error('organizationId is required')
    }

    return authenticatedTransaction(
      async ({ transaction }) => {
        return getCurrentActiveSubscribers(
          { organizationId: ctx.organizationId! },
          transaction
        )
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  }
)

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
  .mutation(async ({ input, ctx }) => {
    return authenticatedTransaction(
      async ({ transaction, userId }) => {
        const { organization } = input
        await updateOrganization(organization, transaction)
        return {
          data: organization,
        }
      },
      {
        apiKey: ctx.apiKey,
      }
    )
  })

export const organizationsRouter = router({
  create: createOrganization,
  update: editOrganization,
  requestStripeConnect: requestStripeConnectOnboardingLink,
  getMembers: getMembers,
  getFocusedMembership: getFocusedMembership,
  inviteUser: inviteUserToOrganization,
  // Revenue is a sub-resource of organizations
  getRevenue: getRevenueData,
  // MRR-related endpoints for the billing dashboard
  getMRR: getMRR,
  getARR: getARR,
  getMRRBreakdown: getMRRBreakdown,
  // Subscriber-related endpoints for the billing dashboard
  getActiveSubscribers: getActiveSubscribers,
  getSubscriberBreakdown: getSubscriberBreakdown,
  getCurrentSubscribers: getCurrentSubscribers,
})
