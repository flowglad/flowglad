import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { protectedProcedure, router } from '@/server/trpc'
import {
  dismissBanner,
  dismissBanners,
  getDismissedBannerIds,
  resetDismissedBanners,
} from '@/utils/redis'

/**
 * Helper to get user ID from context, throwing if not available.
 * The protectedProcedure middleware allows both API key and user auth,
 * but these banner endpoints only make sense for user auth.
 */
const getUserIdOrThrow = (ctx: { user?: { id: string } }): string => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'User authentication required for banner operations',
    })
  }
  return ctx.user.id
}

export const bannersRouter = router({
  /**
   * Get list of banner IDs that the current user has dismissed.
   */
  getDismissedIds: protectedProcedure.query(async ({ ctx }) => {
    const userId = getUserIdOrThrow(ctx)
    return getDismissedBannerIds(userId)
  }),

  /**
   * Dismiss a single banner for the current user.
   */
  dismiss: protectedProcedure
    .input(z.object({ bannerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserIdOrThrow(ctx)
      await dismissBanner(userId, input.bannerId)
      return { success: true }
    }),

  /**
   * Dismiss multiple banners for the current user in a single operation.
   * This is the preferred method when dismissing the entire carousel.
   */
  dismissAll: protectedProcedure
    .input(z.object({ bannerIds: z.array(z.string()).max(10) }))
    .mutation(async ({ ctx, input }) => {
      const userId = getUserIdOrThrow(ctx)
      await dismissBanners(userId, input.bannerIds)
      return { success: true }
    }),

  /**
   * Reset all dismissed banners for the current user (admin/testing only).
   */
  resetDismissed: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = getUserIdOrThrow(ctx)
    await resetDismissedBanners(userId)
    return { success: true }
  }),
})
