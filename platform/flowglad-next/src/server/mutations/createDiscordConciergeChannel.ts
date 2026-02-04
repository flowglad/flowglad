import { TRPCError } from '@trpc/server'
import { Result } from 'better-result'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import {
  selectOrganizationById,
  updateOrganization,
} from '@/db/tableMethods/organizationMethods'
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

      console.log('[Discord Mutation] Fetched organization:', {
        id: organization.id,
        name: organization.name,
        discordConciergeChannelId:
          organization.discordConciergeChannelId,
      })

      // Create or get concierge channel (pass existing ID for fast lookup)
      const { channelId, inviteUrl } =
        await getOrCreateConciergeChannel(
          organization.name,
          organization.discordConciergeChannelId
        )

      console.log('[Discord Mutation] Got channel result:', {
        channelId,
        existingId: organization.discordConciergeChannelId,
        needsUpdate:
          channelId !== organization.discordConciergeChannelId,
      })

      // Persist channel ID if it's new
      if (channelId !== organization.discordConciergeChannelId) {
        console.log(
          '[Discord Mutation] Persisting new channel ID:',
          channelId
        )
        await adminTransaction(async ({ transaction }) => {
          await updateOrganization(
            {
              id: organizationId,
              discordConciergeChannelId: channelId,
            },
            transaction
          )
          return Result.ok(undefined)
        })
        console.log(
          '[Discord Mutation] Channel ID persisted successfully'
        )
      }

      return { inviteUrl }
    } catch (error) {
      console.error('Discord concierge error:', error)
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to create Discord channel',
        cause: error,
      })
    }
  })
