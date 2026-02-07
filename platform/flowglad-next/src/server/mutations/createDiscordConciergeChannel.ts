import { organizations } from '@db-core/schema/organizations'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { protectedProcedure } from '@/server/trpc'
import {
  buildDiscordOAuthUrl,
  getDiscordConfig,
  getOrCreateConciergeChannel,
} from '@/utils/discord'
import {
  createDiscordOAuthCsrfToken,
  encodeDiscordOAuthState,
} from '@/utils/discordOAuthState'

export const createDiscordConciergeChannelSchema = z.object({})

export const createDiscordConciergeChannel = protectedProcedure
  .input(createDiscordConciergeChannelSchema)
  .output(z.object({ oauthUrl: z.string() }))
  .mutation(async ({ ctx }) => {
    const { organizationId } = ctx
    const userId = ctx.user!.id

    if (!organizationId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Organization context required',
      })
    }

    try {
      // Fetch fresh organization data to get latest discordConciergeChannelId
      const organization = (
        await adminTransaction(async ({ transaction }) => {
          return selectOrganizationById(organizationId, transaction)
        })
      ).unwrap()

      // Create or get concierge channel (pass existing ID for fast lookup)
      const { channelId } = await getOrCreateConciergeChannel(
        organization.name,
        organization.discordConciergeChannelId
      )

      let finalChannelId = channelId

      // Persist channel ID using conditional update to prevent race conditions.
      // If a concurrent request already set the channel ID, the WHERE clause
      // won't match, and we fall back to the winner's channel.
      if (channelId !== organization.discordConciergeChannelId) {
        const persistResult = await adminTransaction(
          async ({ transaction }) => {
            const condition =
              organization.discordConciergeChannelId === null
                ? and(
                    eq(organizations.id, organizationId),
                    isNull(organizations.discordConciergeChannelId)
                  )
                : and(
                    eq(organizations.id, organizationId),
                    eq(
                      organizations.discordConciergeChannelId,
                      organization.discordConciergeChannelId
                    )
                  )

            const [updated] = await transaction
              .update(organizations)
              .set({
                discordConciergeChannelId: channelId,
                updatedAt: Date.now(),
              })
              .where(condition)
              .returning()

            if (!updated) {
              // Lost the race — fetch the winner's channel ID
              const winnerResult = await selectOrganizationById(
                organizationId,
                transaction
              )
              const winner = winnerResult.unwrap()
              return Result.ok({
                raceResolved: true,
                winnerChannelId: winner.discordConciergeChannelId,
              })
            }

            return Result.ok({
              raceResolved: false,
              winnerChannelId: null,
            })
          }
        )

        const { raceResolved, winnerChannelId } =
          persistResult.unwrap()

        if (raceResolved && winnerChannelId) {
          finalChannelId = winnerChannelId
        }
      }

      // Generate OAuth URL so the user can authorize and get channel access
      const config = getDiscordConfig()
      const csrfToken = await createDiscordOAuthCsrfToken({
        userId,
        organizationId,
        channelId: finalChannelId,
      })
      const state = encodeDiscordOAuthState(csrfToken)
      const oauthUrl = buildDiscordOAuthUrl({ state, config })

      return { oauthUrl }
    } catch (error) {
      console.error('[Discord Mutation] Error:', error)
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create Discord channel',
        cause: error,
      })
    }
  })
