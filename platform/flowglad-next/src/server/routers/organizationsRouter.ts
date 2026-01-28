import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
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

    const result = await adminTransaction(async ({ transaction }) => {
      const members =
        await selectMembershipsAndUsersByMembershipWhere(
          { organizationId: ctx.organizationId },
          transaction
        )
      return Result.ok(members)
    })

    const members = result.unwrap()
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
  .query(async ({ ctx }) => {
    const userId = ctx.user?.id
    if (!userId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'User authentication required',
      })
    }
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const focusedMembership =
          await selectFocusedMembershipAndOrganization(
            userId,
            transaction
          )
        return Result.ok(focusedMembership)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

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
  .query(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await selectRevenueDataForOrganization(
          input,
          transaction
        )
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

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
  .query(async ({ input, ctx }) => {
    if (!ctx.organizationId) {
      throw new Error('organizationId is required')
    }
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await calculateMRRByMonth(
          ctx.organizationId!,
          {
            ...input,
            productId: input.productId ?? undefined,
          },
          transaction
        )
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const getARR = protectedProcedure.query(async ({ ctx }) => {
  if (!ctx.organizationId) {
    throw new Error('organizationId is required')
  }
  const result = await authenticatedTransaction(
    async ({ transaction }) => {
      const arr = await calculateARR(ctx.organizationId!, transaction)
      return Result.ok(arr)
    },
    { apiKey: ctx.apiKey }
  )
  return result.unwrap()
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
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await calculateMRRBreakdown(
          ctx.organizationId!,
          input.currentMonth,
          input.previousMonth,
          transaction
        )
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

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
  .query(async ({ input, ctx }) => {
    if (!ctx.organizationId) {
      throw new Error('organizationId is required')
    }
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await calculateActiveSubscribersByMonth(
          ctx.organizationId!,
          {
            ...input,
            productId: input.productId ?? undefined,
          },
          transaction
        )
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
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
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await calculateSubscriberBreakdown(
          ctx.organizationId!,
          input.currentMonth,
          input.previousMonth,
          transaction
        )
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const getCurrentSubscribers = protectedProcedure.query(
  async ({ ctx }) => {
    if (!ctx.organizationId) {
      throw new Error('organizationId is required')
    }
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const count = await getCurrentActiveSubscribers(
          { organizationId: ctx.organizationId! },
          transaction
        )
        return Result.ok(count)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  }
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
  .query(async ({ input, ctx }) => {
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

    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await calculateUsageVolumeByInterval(
          ctx.organizationId!,
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
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

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
  .query(async ({ ctx }) => {
    if (!ctx.organizationId) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'organizationId is required',
      })
    }
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const data = await getUsageMetersWithEvents(
          ctx.organizationId!,
          ctx.livemode,
          transaction
        )
        return Result.ok(data)
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const getOrganizations = protectedProcedure.query(async ({ ctx }) => {
  const result = await adminTransaction(async ({ transaction }) => {
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

    return Result.ok(organizations)
  }, {})
  return result.unwrap()
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

    const result = await adminTransaction(
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
    const { organization } = result.unwrap()
    if (input.codebaseMarkdown) {
      await saveOrganizationCodebaseMarkdown({
        organizationId: organization.id,
        markdown: input.codebaseMarkdown,
      })
    }
    return { organization }
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
  .mutation(async ({ input, ctx }) => {
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const { organization } = input
        await updateOrganizationDB(organization, transaction)
        return Result.ok({ data: organization })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

const updateFocusedMembershipSchema = z.object({
  organizationId: z.string(),
})

const updateFocusedMembership = protectedProcedure
  .input(updateFocusedMembershipSchema)
  .mutation(async ({ input, ctx }) => {
    const membershipsResult = await adminTransaction(
      async ({ transaction }) => {
        const data =
          await selectMembershipsAndOrganizationsByMembershipWhere(
            { userId: ctx.user!.id },
            transaction
          )
        return Result.ok(data)
      }
    )
    const memberships = membershipsResult.unwrap()
    const membershipToFocus = memberships.find(
      (m) => m.membership.organizationId === input.organizationId
    )
    if (!membershipToFocus) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Membership not found',
      })
    }
    const result = await adminTransaction(async ({ transaction }) => {
      await unfocusMembershipsForUser(
        membershipToFocus.membership.userId,
        transaction
      )
      const updated = await updateMembership(
        {
          id: membershipToFocus.membership.id,
          focused: true,
        },
        transaction
      )
      return Result.ok(updated)
    })
    return result.unwrap()
  })

const getMembersTableRowData = protectedProcedure
  .input(createPaginatedTableRowInputSchema(z.object({})))
  .output(
    createPaginatedTableRowOutputSchema(membershipsTableRowDataSchema)
  )
  .query(async (args) => {
    const focusedMembershipResult = await authenticatedTransaction(
      async ({ transaction, userId }) => {
        const data = await selectFocusedMembershipAndOrganization(
          userId,
          transaction
        )
        return Result.ok(data)
      },
      { apiKey: args.ctx.apiKey }
    )
    const focusedMembership = focusedMembershipResult.unwrap()
    /**
     * Force overwrite the organizationId because we need to do an admin transaction
     * to give the user visbility into their teammates. Due to limitations of RLS,
     * we can't do this in the authenticated transaction as memberships
     * is the "root" basis of most of our RLS policies.
     */
    const result = await adminTransaction(async ({ transaction }) => {
      const data = await selectMembershipsTableRowData({
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
      return Result.ok(data)
    })
    return result.unwrap()
  })

/**
 * Get notification preferences for the current user in their current organization.
 * Returns the merged preferences (stored values + defaults).
 */
const getNotificationPreferences = protectedProcedure
  .output(notificationPreferencesSchema)
  .query(async ({ ctx }) => {
    const userId = ctx.user?.id
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
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const [membership] = await selectMemberships(
          { userId, organizationId: ctx.organizationId! },
          transaction
        )
        if (!membership) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'Membership not found',
          })
        }
        return Result.ok(
          getMembershipNotificationPreferences(membership)
        )
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

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
  .mutation(async ({ input, ctx }) => {
    const userId = ctx.user?.id
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
    const result = await authenticatedTransaction(
      async ({ transaction }) => {
        const [membership] = await selectMemberships(
          { userId, organizationId: ctx.organizationId! },
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
        return Result.ok({
          preferences:
            getMembershipNotificationPreferences(updatedMembership),
        })
      },
      { apiKey: ctx.apiKey }
    )
    return result.unwrap()
  })

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
