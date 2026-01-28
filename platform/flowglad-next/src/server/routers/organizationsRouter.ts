import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { z } from 'zod'
import {
  adminTransaction,
  comprehensiveAdminTransaction,
} from '@/db/adminTransaction'
import {
  authenticatedProcedureTransaction,
  authenticatedTransaction,
} from '@/db/authenticatedTransaction'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  membershipsClientSelectSchema,
  membershipsTableRowDataSchema,
  type NotificationPreferences,
  notificationPreferencesSchema,
} from '@/db/schema/memberships'
import {
  createOrganizationSchema,
  editOrganizationSchema,
  organizationsClientSelectSchema,
} from '@/db/schema/organizations'
import { getRevenueDataInputSchema } from '@/db/schema/payments'
import {
  getMembershipNotificationPreferences,
  selectFocusedMembershipAndOrganization,
  selectMembershipAndOrganizationsByBetterAuthUserId,
  selectMemberships,
  selectMembershipsAndOrganizationsByMembershipWhere,
  selectMembershipsAndUsersByMembershipWhere,
  selectMembershipsTableRowData,
  unfocusMembershipsForUser,
  updateMembership,
} from '@/db/tableMethods/membershipMethods'
import { updateOrganization as updateOrganizationDB } from '@/db/tableMethods/organizationMethods'
import { selectRevenueDataForOrganization } from '@/db/tableMethods/paymentMethods'
import { selectUsers } from '@/db/tableMethods/userMethods'
import {
  createPaginatedTableRowInputSchema,
  createPaginatedTableRowOutputSchema,
} from '@/db/tableUtils'
import { requestStripeConnectOnboardingLink } from '@/server/mutations/requestStripeConnectOnboardingLink'
import { protectedProcedure, router } from '@/server/trpc'
import {
  RevenueChartIntervalUnit,
  UsageMeterAggregationType,
} from '@/types'
import { getSession } from '@/utils/auth'
import {
  calculateARR,
  calculateMRRBreakdown,
  calculateMRRByMonth,
} from '@/utils/billing-dashboard/revenueCalculationHelpers'
import {
  calculateActiveSubscribersByMonth,
  calculateSubscriberBreakdown,
  getCurrentActiveSubscribers,
} from '@/utils/billing-dashboard/subscriberCalculationHelpers'
import {
  calculateUsageVolumeByInterval,
  getUsageMetersWithEvents,
} from '@/utils/billing-dashboard/usageCalculationHelpers'
import { createOrganizationTransaction } from '@/utils/organizationHelpers'
import {
  getOrganizationCodebaseMarkdown,
  saveOrganizationCodebaseMarkdown,
} from '@/utils/textContent'
import { inviteUserToOrganization } from '../mutations/inviteUserToOrganization'
import { removeMemberFromOrganization } from '../mutations/removeMemberFromOrganization'

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

const getMembers = protectedProcedure
  .input(z.object({}))
  .query(async ({ ctx, input }) => {
    if (!ctx.organizationId) {
      throw new Error('organizationId is required')
    }

    const members = await adminTransaction(
      async ({ transaction }) => {
        return selectMembershipsAndUsersByMembershipWhere(
          { organizationId: ctx.organizationId },
          transaction
        )
      }
    )

    // Sort members by date of creation, newest first
    const sortedMembers = members.sort((a, b) => {
      return (
        new Date(b.membership.createdAt).getTime() -
        new Date(a.membership.createdAt).getTime()
      )
    })
    const total = sortedMembers.length

    return {
      data: sortedMembers,
      total,
    }
  })

const getFocusedMembership = protectedProcedure
  .output(
    z.object({
      membership: membershipsClientSelectSchema,
      organization: organizationsClientSelectSchema,
    })
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ ctx, transactionCtx }) => {
        const userId = ctx.user?.id
        const { transaction } = transactionCtx
        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User authentication required',
          })
        }
        const focusedMembership =
          await selectFocusedMembershipAndOrganization(
            userId,
            transaction
          )
        return focusedMembership
      }
    )
  )

const getRevenueData = protectedProcedure
  .input(getRevenueDataInputSchema)
  .output(
    z.array(
      z.object({
        date: z.date(),
        revenue: z.number(),
      })
    )
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        return selectRevenueDataForOrganization(input, transaction)
      }
    )
  )

const getMRRCalculationInputSchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
  granularity: z.enum(RevenueChartIntervalUnit),
  productId: z.string().nullish(),
})

const getMRR = protectedProcedure
  .input(getMRRCalculationInputSchema)
  .output(
    z.array(
      z.object({
        month: z.date(),
        amount: z.number(),
      })
    )
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        if (!ctx.organizationId) {
          throw new Error('organizationId is required')
        }

        return calculateMRRByMonth(
          ctx.organizationId!,
          {
            ...input,
            productId: input.productId ?? undefined,
          },
          transaction
        )
      }
    )
  )

const getARR = protectedProcedure.query(
  authenticatedProcedureTransaction(
    async ({ ctx, transactionCtx }) => {
      const { transaction } = transactionCtx
      if (!ctx.organizationId) {
        throw new Error('organizationId is required')
      }

      return calculateARR(ctx.organizationId!, transaction)
    }
  )
)

const getMRRBreakdownInputSchema = z.object({
  currentMonth: z.date(),
  previousMonth: z.date(),
})

const getMRRBreakdown = protectedProcedure
  .input(getMRRBreakdownInputSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        if (!ctx.organizationId) {
          throw new Error('organizationId is required')
        }

        return calculateMRRBreakdown(
          ctx.organizationId!,
          input.currentMonth,
          input.previousMonth,
          transaction
        )
      }
    )
  )

const getActiveSubscribersInputSchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
  granularity: z.enum(RevenueChartIntervalUnit),
  productId: z.string().nullish(),
})

const getActiveSubscribers = protectedProcedure
  .input(getActiveSubscribersInputSchema)
  .output(
    z.array(
      z.object({
        month: z.date(),
        count: z.number(),
      })
    )
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        if (!ctx.organizationId) {
          throw new Error('organizationId is required')
        }

        return calculateActiveSubscribersByMonth(
          ctx.organizationId!,
          {
            ...input,
            productId: input.productId ?? undefined,
          },
          transaction
        )
      }
    )
  )

const getSubscriberBreakdownInputSchema = z.object({
  currentMonth: z.date(),
  previousMonth: z.date(),
})

const getSubscriberBreakdown = protectedProcedure
  .input(getSubscriberBreakdownInputSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        if (!ctx.organizationId) {
          throw new Error('organizationId is required')
        }

        return calculateSubscriberBreakdown(
          ctx.organizationId!,
          input.currentMonth,
          input.previousMonth,
          transaction
        )
      }
    )
  )

const getCurrentSubscribers = protectedProcedure.query(
  authenticatedProcedureTransaction(
    async ({ ctx, transactionCtx }) => {
      const { transaction } = transactionCtx
      if (!ctx.organizationId) {
        throw new Error('organizationId is required')
      }

      return getCurrentActiveSubscribers(
        { organizationId: ctx.organizationId! },
        transaction
      )
    }
  )
)

// Usage volume endpoints for billing dashboard
const getUsageVolumeInputSchema = z.object({
  startDate: z.date(),
  endDate: z.date(),
  granularity: z.enum(RevenueChartIntervalUnit),
  usageMeterId: z.string(),
  productId: z.string().nullish(),
})

const getUsageVolume = protectedProcedure
  .input(getUsageVolumeInputSchema)
  .output(
    z.array(
      z.object({
        date: z.date(),
        amount: z.number(),
      })
    )
  )
  .query(
    authenticatedProcedureTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        if (!ctx.organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'organizationId is required',
          })
        }

        // Validate date range
        if (input.startDate >= input.endDate) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'startDate must be before endDate',
          })
        }

        return calculateUsageVolumeByInterval(
          ctx.organizationId,
          {
            startDate: input.startDate,
            endDate: input.endDate,
            granularity: input.granularity,
            usageMeterId: input.usageMeterId,
            productId: input.productId ?? undefined,
            livemode: ctx.livemode,
          },
          transaction
        )
      }
    )
  )

// Empty input - meter list is decoupled from product filter
const getUsageMetersWithEventsInputSchema = z.object({})

const getUsageMetersWithEventsOutput = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    aggregationType: z.enum(UsageMeterAggregationType),
    pricingModelId: z.string(), // For future UX enhancements
  })
)

const getUsageMetersWithEventsProcedure = protectedProcedure
  .input(getUsageMetersWithEventsInputSchema)
  .output(getUsageMetersWithEventsOutput)
  .query(
    authenticatedProcedureTransaction(
      async ({ ctx, transactionCtx }) => {
        const { transaction } = transactionCtx
        if (!ctx.organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'organizationId is required',
          })
        }

        return getUsageMetersWithEvents(
          ctx.organizationId,
          ctx.livemode,
          transaction
        )
      }
    )
  )

const getOrganizations = protectedProcedure.query(async ({ ctx }) => {
  return adminTransaction(async ({ transaction }) => {
    // Get all memberships and organizations for the user
    const membershipsAndOrganizations =
      await selectMembershipsAndOrganizationsByMembershipWhere(
        { userId: ctx.user!.id },
        transaction
      )

    // Extract just the organizations
    const organizations = membershipsAndOrganizations.map(
      ({ organization }) => organization
    )

    return organizations
  }, {})
})

const createOrganization = protectedProcedure
  .input(createOrganizationSchema)
  .output(
    z.object({
      organization: organizationsClientSelectSchema,
    })
  )
  .mutation(async ({ input }) => {
    const session = await getSession()

    if (!session) {
      throw new Error('User not found')
    }

    const result = await comprehensiveAdminTransaction(
      async ({ transaction, cacheRecomputationContext }) => {
        const [user] = await selectUsers(
          {
            betterAuthId: session.user.id,
          },
          transaction
        )
        const organizationResult =
          await createOrganizationTransaction(
            input,
            {
              id: user.id,
              email: user.email!,
              fullName: user.name ?? undefined,
            },
            transaction,
            cacheRecomputationContext
          )
        return Result.ok(organizationResult)
      }
    )
    if (input.codebaseMarkdown) {
      await saveOrganizationCodebaseMarkdown({
        organizationId: result.organization.id,
        markdown: input.codebaseMarkdown,
      })
    }
    return {
      organization: result.organization,
    }
  })

const getCodebaseMarkdown = protectedProcedure
  .output(z.string().nullable())
  .query(async ({ ctx }) => {
    if (!ctx.organizationId) {
      throw new Error('organizationId is required')
    }

    return getOrganizationCodebaseMarkdown(ctx.organizationId)
  })

const updateCodebaseMarkdown = protectedProcedure
  .input(z.object({ markdown: z.string() }))
  .mutation(async ({ ctx, input }) => {
    if (!ctx.organizationId) {
      throw new Error('organizationId is required')
    }

    await saveOrganizationCodebaseMarkdown({
      organizationId: ctx.organizationId,
      markdown: input.markdown,
    })
  })

const updateOrganization = protectedProcedure
  .input(editOrganizationSchema)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, transactionCtx }) => {
        const { transaction } = transactionCtx
        const { organization } = input
        await updateOrganizationDB(organization, transaction)
        return {
          data: organization,
        }
      }
    )
  )

const updateFocusedMembershipSchema = z.object({
  organizationId: z.string(),
})

const updateFocusedMembership = protectedProcedure
  .input(updateFocusedMembershipSchema)
  .mutation(async ({ input, ctx }) => {
    const memberships = await adminTransaction(
      async ({ transaction }) => {
        return selectMembershipsAndOrganizationsByMembershipWhere(
          { userId: ctx.user!.id },
          transaction
        )
      }
    )
    const membershipToFocus = memberships.find(
      (m) => m.membership.organizationId === input.organizationId
    )
    if (!membershipToFocus) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Membership not found',
      })
    }
    return adminTransaction(async ({ transaction }) => {
      await unfocusMembershipsForUser(
        membershipToFocus.membership.userId,
        transaction
      )
      return updateMembership(
        {
          id: membershipToFocus.membership.id,
          focused: true,
        },
        transaction
      )
    })
  })

const getMembersTableRowData = protectedProcedure
  .input(createPaginatedTableRowInputSchema(z.object({})))
  .output(
    createPaginatedTableRowOutputSchema(membershipsTableRowDataSchema)
  )
  .query(async (args) => {
    const focusedMembership = await authenticatedTransaction(
      async ({ transaction, userId }) => {
        return selectFocusedMembershipAndOrganization(
          userId,
          transaction
        )
      }
    )
    /**
     * Force overwrite the organizationId because we need to do an admin transaction
     * to give the user visbility into their teammates. Due to limitations of RLS,
     * we can't do this in the authenticated transaction as memberships
     * is the "root" basis of most of our RLS policies.
     */
    return adminTransaction(async ({ transaction }) => {
      return selectMembershipsTableRowData({
        input: {
          ...args.input,
          filters: {
            ...args.input.filters,
            organizationId: focusedMembership.organization.id,
            deactivatedAt: null,
          },
        },
        transaction,
      })
    })
  })

/**
 * Get notification preferences for the current user in their current organization.
 * Returns the merged preferences (stored values + defaults).
 */
const getNotificationPreferences = protectedProcedure
  .output(notificationPreferencesSchema)
  .query(
    authenticatedProcedureTransaction(
      async ({ ctx, transactionCtx }) => {
        const userId = ctx.user?.id
        const { transaction } = transactionCtx
        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User authentication required',
          })
        }
        if (!ctx.organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'organizationId is required',
          })
        }
        const [membership] = await selectMemberships(
          { userId, organizationId: ctx.organizationId },
          transaction
        )
        if (!membership) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Membership not found',
          })
        }
        return getMembershipNotificationPreferences(membership)
      }
    )
  )

/**
 * Input schema for updating notification preferences.
 * Uses a schema WITHOUT defaults to allow partial updates.
 * Only the fields explicitly provided will be updated.
 */
const updateNotificationPreferencesInputSchema = z.object({
  preferences: z
    .object({
      testModeNotifications: z.boolean().optional(),
      subscriptionCreated: z.boolean().optional(),
      subscriptionAdjusted: z.boolean().optional(),
      subscriptionCanceled: z.boolean().optional(),
      subscriptionCancellationScheduled: z.boolean().optional(),
      paymentFailed: z.boolean().optional(),
      paymentSuccessful: z.boolean().optional(),
    })
    .partial(),
})

const updateNotificationPreferencesOutputSchema = z.object({
  preferences: notificationPreferencesSchema,
})

/**
 * Update notification preferences for the current user in their current organization.
 * Only updates the specified preferences, preserving unspecified ones.
 */
const updateNotificationPreferences = protectedProcedure
  .input(updateNotificationPreferencesInputSchema)
  .output(updateNotificationPreferencesOutputSchema)
  .mutation(
    authenticatedProcedureTransaction(
      async ({ input, ctx, transactionCtx }) => {
        const userId = ctx.user?.id
        const { transaction } = transactionCtx
        if (!userId) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'User authentication required',
          })
        }
        if (!ctx.organizationId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'organizationId is required',
          })
        }
        const [membership] = await selectMemberships(
          { userId, organizationId: ctx.organizationId },
          transaction
        )
        if (!membership) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Membership not found',
          })
        }
        // Get the raw stored preferences (partial object) to preserve existing values
        const storedPrefs =
          (membership.notificationPreferences as Partial<NotificationPreferences>) ??
          {}
        // Merge stored preferences with the new input preferences
        const updatedPrefs = { ...storedPrefs, ...input.preferences }
        const updatedMembership = await updateMembership(
          {
            id: membership.id,
            notificationPreferences: updatedPrefs,
          },
          transaction
        )
        // Return full preferences merged with defaults to ensure all fields are present
        return {
          preferences:
            getMembershipNotificationPreferences(updatedMembership),
        }
      }
    )
  )

export const organizationsRouter = router({
  create: createOrganization,
  update: updateOrganization,
  requestStripeConnect: requestStripeConnectOnboardingLink,
  getMembers: getMembers,
  getMembersTableRowData: getMembersTableRowData,
  getFocusedMembership: getFocusedMembership,
  updateFocusedMembership: updateFocusedMembership,
  getOrganizations: getOrganizations,
  inviteUser: inviteUserToOrganization,
  removeMember: removeMemberFromOrganization,
  getCodebaseMarkdown: getCodebaseMarkdown,
  updateCodebaseMarkdown: updateCodebaseMarkdown,
  // Notification preferences for the current user
  getNotificationPreferences: getNotificationPreferences,
  updateNotificationPreferences: updateNotificationPreferences,
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
  // Usage volume endpoints for the billing dashboard
  getUsageVolume: getUsageVolume,
  getUsageMetersWithEvents: getUsageMetersWithEventsProcedure,
})
