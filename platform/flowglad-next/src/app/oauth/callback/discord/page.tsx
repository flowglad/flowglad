import { Result } from 'better-result'
import { redirect } from 'next/navigation'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import {
  addUserToGuild,
  exchangeDiscordOAuthCode,
  getDiscordChannelUrl,
  getDiscordConfig,
  getDiscordUserFromToken,
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

    await grantChannelAccess({
      channelId: validation.channelId,
      discordUserId: discordUser.id,
      config,
    })

    redirectUrl = getDiscordChannelUrl(
      config.guildId,
      validation.channelId
    )
  } catch (error) {
    logger.error('Discord OAuth callback failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    redirectUrl = '/onboarding?error=discord_connection_failed'
  }

  redirect(redirectUrl)
}
