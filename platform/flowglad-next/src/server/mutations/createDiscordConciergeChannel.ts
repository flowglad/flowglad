import { organizations } from '@db-core/schema/organizations'
import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
import { protectedProcedure } from '@/server/trpc'
import { getOrCreateConciergeChannel } from '@/utils/discord'

export const createDiscordConciergeChannelSchema = z.object({})

export const createDiscordConciergeChannel = protectedProcedure
  .input(createDiscordConciergeChannelSchema)
  .output(z.object({ inviteUrl: z.string() }))
  .mutation(async ({ ctx }) => {
    const { organizationId } = ctx

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
      const { channelId, inviteUrl } =
        await getOrCreateConciergeChannel(
          organization.name,
          organization.discordConciergeChannelId
        )

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
          // Return invite for the channel that was persisted first
          const winner = await getOrCreateConciergeChannel(
            organization.name,
            winnerChannelId
          )
          return { inviteUrl: winner.inviteUrl }
        }
      }

      return { inviteUrl }
    } catch (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create Discord channel',
        cause: error,
      })
    }
  })
