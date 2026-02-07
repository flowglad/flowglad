import { Result } from 'better-result'
import { redirect } from 'next/navigation'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  selectOrganizationById,
  updateOrganization,
} from '@/db/tableMethods/organizationMethods'
import {
  addUserToGuild,
  exchangeDiscordOAuthCode,
  getDiscordChannelUrl,
  getDiscordConfig,
  getDiscordUserFromToken,
  getOrCreateConciergeChannel,
  grantChannelAccess,
} from '@/utils/discord'
import {
  decodeDiscordOAuthState,
  validateAndConsumeDiscordOAuthCsrfToken,
} from '@/utils/discordOAuthState'
import { logger } from '@/utils/logger'
export default async function DiscordOAuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string }>
}) {
  const { code, state } = await searchParams

  if (!code || !state) {
    redirect('/onboarding')
  }

  let redirectUrl: string

  try {
    const csrfToken = decodeDiscordOAuthState(state)

    const userId = (
      await authenticatedTransaction(async ({ userId }) =>
        Result.ok(userId)
      )
    ).unwrap()

    const validation = await validateAndConsumeDiscordOAuthCsrfToken({
      csrfToken,
      expectedUserId: userId,
    })

    if (!validation) {
      throw new Error('CSRF validation failed')
    }

    const config = getDiscordConfig()
    const tokenResult = await exchangeDiscordOAuthCode({
      code,
      config,
    })

    const discordUser = await getDiscordUserFromToken(
      tokenResult.access_token
    )

    await addUserToGuild({
      guildId: config.guildId,
      discordUserId: discordUser.id,
      accessToken: tokenResult.access_token,
      config,
    })

    // Fetch org to get existing channel ID (if any) and org name
    const organization = (
      await adminTransaction(async ({ transaction }) => {
        return selectOrganizationById(
          validation.organizationId,
          transaction
        )
      })
    ).unwrap()

    // Create or reuse existing concierge channel
    const { channelId } = await getOrCreateConciergeChannel(
      organization.name,
      organization.discordConciergeChannelId
    )

    // Persist channel ID if it changed
    if (channelId !== organization.discordConciergeChannelId) {
      ;(
        await adminTransaction(async ({ transaction }) => {
          await updateOrganization(
            {
              id: validation.organizationId,
              discordConciergeChannelId: channelId,
            },
            transaction
          )
          return Result.ok(undefined)
        })
      ).unwrap()
    }

    // Re-read org to get actual stored channel (handles concurrent race)
    const updatedOrg = (
      await adminTransaction(async ({ transaction }) => {
        return selectOrganizationById(
          validation.organizationId,
          transaction
        )
      })
    ).unwrap()

    const actualChannelId =
      updatedOrg.discordConciergeChannelId ?? channelId

    await grantChannelAccess({
      channelId: actualChannelId,
      discordUserId: discordUser.id,
      config,
    })

    redirectUrl = getDiscordChannelUrl(
      config.guildId,
      actualChannelId
    )
  } catch (error) {
    logger.error('Discord OAuth callback failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    redirectUrl = '/onboarding?error=discord_connection_failed'
  }

  redirect(redirectUrl)
}
