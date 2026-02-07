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

export default async function DiscordOAuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; state?: string }>
}) {
  const { code, state } = await searchParams

  if (!code || !state) {
    redirect('/onboarding')
  }

  try {
    console.log(
      '[Discord OAuth] Starting callback, code length:',
      code.length,
      'state length:',
      state.length
    )

    const csrfToken = decodeDiscordOAuthState(state)
    console.log(
      '[Discord OAuth] Decoded CSRF token, prefix:',
      csrfToken.substring(0, 4)
    )

    const userId = (
      await authenticatedTransaction(async ({ userId }) =>
        Result.ok(userId)
      )
    ).unwrap()
    console.log('[Discord OAuth] Authenticated user:', userId)

    const validation = await validateAndConsumeDiscordOAuthCsrfToken({
      csrfToken,
      expectedUserId: userId,
    })
    console.log('[Discord OAuth] CSRF validation result:', validation)

    if (!validation) {
      throw new Error('CSRF validation failed')
    }

    const config = getDiscordConfig()
    console.log('[Discord OAuth] Exchanging code for token...')
    const tokenResult = await exchangeDiscordOAuthCode({
      code,
      config,
    })
    console.log(
      '[Discord OAuth] Token exchange successful, token type:',
      tokenResult.token_type
    )

    const discordUser = await getDiscordUserFromToken(
      tokenResult.access_token
    )
    console.log(
      '[Discord OAuth] Discord user:',
      discordUser.id,
      discordUser.username
    )

    console.log(
      '[Discord OAuth] Adding user to guild:',
      config.guildId
    )
    await addUserToGuild({
      guildId: config.guildId,
      discordUserId: discordUser.id,
      accessToken: tokenResult.access_token,
      config,
    })
    console.log('[Discord OAuth] User added to guild')

    console.log(
      '[Discord OAuth] Granting channel access:',
      validation.channelId
    )
    await grantChannelAccess({
      channelId: validation.channelId,
      discordUserId: discordUser.id,
      config,
    })
    console.log('[Discord OAuth] Channel access granted')

    const channelUrl = getDiscordChannelUrl(
      config.guildId,
      validation.channelId
    )
    console.log('[Discord OAuth] Redirecting to:', channelUrl)
    redirect(channelUrl)
  } catch (error) {
    if (error instanceof Error && error.message === 'NEXT_REDIRECT') {
      throw error
    }
    console.error('[Discord OAuth] Error:', error)
    redirect('/onboarding?error=discord_connection_failed')
  }
}
