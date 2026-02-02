import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { adminTransaction } from '@/db/adminTransaction'
import { updateOrganization } from '@/db/tableMethods/organizationMethods'
import { protectedProcedure } from '@/server/trpc'
import { getOrCreateConciergeChannel } from '@/utils/discord'

export const createDiscordConciergeChannelSchema = z.object({})

export const createDiscordConciergeChannel = protectedProcedure
  .input(createDiscordConciergeChannelSchema)
  .output(z.object({ inviteUrl: z.string() }))
  .mutation(async ({ ctx }) => {
    const { organization, organizationId } = ctx

    if (!organization || !organizationId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Organization context required',
      })
    }

    try {
      // Create or get concierge channel (pass existing ID for fast lookup)
      const { channelId, inviteUrl } =
        await getOrCreateConciergeChannel(
          organization.name,
          organization.discordConciergeChannelId
        )

      // Persist channel ID if it's new
      if (channelId !== organization.discordConciergeChannelId) {
        await adminTransaction(async ({ transaction }) => {
          await updateOrganization(
            {
              id: organizationId,
              discordConciergeChannelId: channelId,
            },
            transaction
          )
        })
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
