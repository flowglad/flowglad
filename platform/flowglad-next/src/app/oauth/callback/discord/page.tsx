import { organizations } from '@db-core/schema/organizations'
import { Result } from 'better-result'
import { and, eq, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { adminTransaction } from '@/db/adminTransaction'
import { authenticatedTransaction } from '@/db/authenticatedTransaction'
import { selectOrganizationById } from '@/db/tableMethods/organizationMethods'
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

    // Persist channel ID if it changed, using compare-and-swap for race safety
    if (channelId !== organization.discordConciergeChannelId) {
      await adminTransaction(async ({ transaction }) => {
        const condition =
          organization.discordConciergeChannelId === null
            ? and(
                eq(organizations.id, validation.organizationId),
                isNull(organizations.discordConciergeChannelId)
              )
            : and(
                eq(organizations.id, validation.organizationId),
                eq(
                  organizations.discordConciergeChannelId,
                  organization.discordConciergeChannelId
                )
              )

        await transaction
          .update(organizations)
          .set({
            discordConciergeChannelId: channelId,
            updatedAt: Date.now(),
          })
          .where(condition)

        return Result.ok(undefined)
      })
    }

    await grantChannelAccess({
      channelId,
      discordUserId: discordUser.id,
      config,
    })

    redirectUrl = getDiscordChannelUrl(config.guildId, channelId)
  } catch {
    redirectUrl = '/onboarding?error=discord_connection_failed'
  }

  redirect(redirectUrl)
}
