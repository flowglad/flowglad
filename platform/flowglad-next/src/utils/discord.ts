import { REST } from '@discordjs/rest'
import {
  type APIChannel,
  type APIExtendedInvite,
  type APIMessage,
  type APIOverwrite,
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  type RESTPostAPIChannelInviteJSONBody,
  type RESTPostAPIChannelMessageJSONBody,
  type RESTPostAPIGuildChannelJSONBody,
  Routes,
} from 'discord-api-types/v10'

export interface ConciergeChannelResult {
  channelId: string
  inviteUrl: string
}

export interface DiscordConfig {
  botToken: string
  guildId: string
  conciergeCategoryPrefix: string
  flowgladTeamRoleId?: string
}

const DISCORD_CATEGORY_CHANNEL_LIMIT = 50

// Singleton REST client (no WebSocket overhead)
let restClient: REST | null = null

function getRestClient(botToken: string): REST {
  if (!restClient) {
    restClient = new REST({ version: '10' }).setToken(botToken)
  }
  return restClient
}

export function getDiscordConfig(): DiscordConfig {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const guildId = process.env.DISCORD_GUILD_ID
  const conciergeCategoryPrefix =
    process.env.DISCORD_CONCIERGE_CATEGORY_PREFIX ??
    'Concierge Cohort'
  const flowgladTeamRoleId = process.env.DISCORD_FLOWGLAD_TEAM_ROLE_ID

  if (!botToken) {
    throw new Error(
      'DISCORD_BOT_TOKEN environment variable is required'
    )
  }
  if (!guildId) {
    throw new Error(
      'DISCORD_GUILD_ID environment variable is required'
    )
  }

  return {
    botToken,
    guildId,
    conciergeCategoryPrefix,
    flowgladTeamRoleId,
  }
}

/**
 * Sanitize organization name to valid Discord channel name.
 * Discord channel names: lowercase, alphanumeric and hyphens, max 100 chars.
 */
export function sanitizeChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

/**
 * Fetch a channel by ID. Returns null if not found.
 */
async function fetchChannelById(
  rest: REST,
  channelId: string
): Promise<APIChannel | null> {
  try {
    return (await rest.get(Routes.channel(channelId))) as APIChannel
  } catch {
    return null
  }
}

/**
 * Parse cohort number from category name. Returns null if can't parse.
 * E.g., "Concierge Cohort #3" -> 3, "Concierge Cohort 3" -> 3
 */
export function parseCohortNumber(
  name: string,
  prefix: string
): number | null {
  if (!name.startsWith(prefix)) return null
  const suffix = name.slice(prefix.length).trim()
  // Handle both "#3" and "3" formats
  const numStr = suffix.startsWith('#') ? suffix.slice(1) : suffix
  const num = parseInt(numStr, 10)
  return isNaN(num) ? null : num
}

export interface CategoryInfo {
  id: string
  cohortNum: number
  childCount: number
}

export type CategorySelectionResult =
  | { action: 'use_existing'; id: string }
  | { action: 'create_new'; cohortNum: number }

/**
 * Pure function to select which category to use for a new channel.
 * Returns either an existing category ID or instructions to create a new one.
 * Prefers lower cohort numbers when multiple categories have space.
 */
export function selectCategoryForChannel(
  categories: CategoryInfo[],
  limit: number = DISCORD_CATEGORY_CHANNEL_LIMIT
): CategorySelectionResult {
  const sorted = [...categories].sort(
    (a, b) => a.cohortNum - b.cohortNum
  )
  const available = sorted.find((c) => c.childCount < limit)

  if (available) {
    return { action: 'use_existing', id: available.id }
  }

  const nextCohortNum =
    categories.length > 0
      ? Math.max(...categories.map((c) => c.cohortNum)) + 1
      : 1

  return { action: 'create_new', cohortNum: nextCohortNum }
}

/**
 * Find or create a category with available space (< 50 channels).
 * Categories are named "{prefix} {number}" (e.g., "Concierge Cohort 1").
 * Returns the category ID.
 */
async function getOrCreateCategoryWithSpace(
  rest: REST,
  guildId: string,
  config: DiscordConfig
): Promise<string> {
  // Fetch all guild channels
  const channels = (await rest.get(
    Routes.guildChannels(guildId)
  )) as APIChannel[]

  // Find all concierge categories and count their children
  const categories: CategoryInfo[] = []

  for (const channel of channels) {
    if (
      channel.type === ChannelType.GuildCategory &&
      channel.name?.startsWith(config.conciergeCategoryPrefix)
    ) {
      const cohortNum = parseCohortNumber(
        channel.name,
        config.conciergeCategoryPrefix
      )
      const childCount = channels.filter(
        (c) => 'parent_id' in c && c.parent_id === channel.id
      ).length
      categories.push({
        id: channel.id,
        cohortNum: cohortNum ?? categories.length + 1, // Fallback to count if can't parse
        childCount,
      })
    }
  }

  // Use pure function to determine category selection
  const selection = selectCategoryForChannel(categories)

  if (selection.action === 'use_existing') {
    return selection.id
  }

  // Create new category
  const newCategory = (await rest.post(
    Routes.guildChannels(guildId),
    {
      body: {
        name: `${config.conciergeCategoryPrefix} #${selection.cohortNum}`,
        type: ChannelType.GuildCategory,
      },
    }
  )) as APIChannel

  return newCategory.id
}

/**
 * Get the bot's user ID by calling /users/@me
 */
async function getBotUserId(rest: REST): Promise<string> {
  const user = (await rest.get(Routes.user('@me'))) as { id: string }
  return user.id
}

/**
 * Create a private text channel that only invited users and Flowglad team can see.
 * Automatically places it in a category with available space.
 */
async function createPrivateChannel(
  rest: REST,
  guildId: string,
  name: string,
  config: DiscordConfig
): Promise<APIChannel> {
  // Find or create a category with space
  const categoryId = await getOrCreateCategoryWithSpace(
    rest,
    guildId,
    config
  )

  // Get bot's user ID so we can grant it access to the channel
  const botUserId = await getBotUserId(rest)

  const permissionOverwrites: APIOverwrite[] = [
    {
      id: guildId, // @everyone role (same as guild ID)
      type: OverwriteType.Role,
      deny: PermissionFlagsBits.ViewChannel.toString(),
      allow: '0',
    },
    {
      // Grant the bot access to view and manage the channel
      id: botUserId,
      type: OverwriteType.Member,
      allow: (
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.ManageChannels
      ).toString(),
      deny: '0',
    },
  ]

  // Add Flowglad team role if configured
  if (config.flowgladTeamRoleId) {
    permissionOverwrites.push({
      id: config.flowgladTeamRoleId,
      type: OverwriteType.Role,
      allow: (
        PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.SendMessages
      ).toString(),
      deny: '0',
    })
  }

  const body: RESTPostAPIGuildChannelJSONBody = {
    name,
    type: ChannelType.GuildText,
    parent_id: categoryId,
    permission_overwrites: permissionOverwrites,
  }

  return (await rest.post(Routes.guildChannels(guildId), {
    body,
  })) as APIChannel
}

/**
 * Build the welcome message content for a new concierge channel.
 */
export function buildWelcomeMessage(
  orgName: string,
  flowgladTeamRoleId?: string
): string {
  const teamMention = flowgladTeamRoleId
    ? `<@&${flowgladTeamRoleId}>`
    : 'the Flowglad team'

  return `@here Welcome to your private concierge channel with ${teamMention}! Ask us any questions about onboarding, we're here to help 🙌

**To finish setup, head to <https://app.flowglad.com/onboarding>:**

1️⃣ **Copy API Key** — Add your secret key to \`.env\`
2️⃣ **Define Your Pricing** — Set up products, plans, and features
3️⃣ **Enable Payments** — Connect Stripe to process payments
4️⃣ **Install MCP Server** — Use our MCP server for easy integrations with your codebase

We typically respond within 2 minutes during business hours. Drop your questions here anytime!`
}

/**
 * Post a welcome message to a newly created channel.
 */
async function postWelcomeMessage(
  rest: REST,
  channelId: string,
  orgName: string,
  config: DiscordConfig
): Promise<APIMessage> {
  const content = buildWelcomeMessage(
    orgName,
    config.flowgladTeamRoleId
  )

  const body: RESTPostAPIChannelMessageJSONBody = {
    content,
  }

  return (await rest.post(Routes.channelMessages(channelId), {
    body,
  })) as APIMessage
}

/**
 * Get channel invites and find a valid one, or create a new invite.
 */
async function getOrCreateInvite(
  rest: REST,
  channelId: string
): Promise<string> {
  // Fetch existing invites
  const invites = (await rest.get(
    Routes.channelInvites(channelId)
  )) as APIExtendedInvite[]

  // Find a valid invite (unlimited uses, not expired)
  const existingInvite = invites.find(
    (inv) =>
      inv.max_uses === 0 &&
      (inv.expires_at === null ||
        new Date(inv.expires_at) > new Date())
  )

  if (existingInvite) {
    return `https://discord.gg/${existingInvite.code}`
  }

  // Create new invite: 7 days, unlimited uses
  const body: RESTPostAPIChannelInviteJSONBody = {
    max_age: 604800, // 7 days in seconds
    max_uses: 0, // unlimited
    unique: false,
  }

  const invite = (await rest.post(Routes.channelInvites(channelId), {
    body,
  })) as APIExtendedInvite
  return `https://discord.gg/${invite.code}`
}

/**
 * Main function: Get or create a concierge channel for an organization.
 * If existingChannelId is provided, tries to find that channel first.
 * Returns channelId so caller can persist it in the database.
 *
 * Race condition handling: If two requests run concurrently and both create channels,
 * Discord allows duplicate names so both succeed. The caller uses a conditional DB
 * update (compare-and-swap) to persist only the first channel ID, and falls back to
 * the winner's channel if it loses the race.
 */
export async function getOrCreateConciergeChannel(
  orgName: string,
  existingChannelId?: string | null
): Promise<ConciergeChannelResult> {
  const config = getDiscordConfig()
  const rest = getRestClient(config.botToken)
  const channelName = `${sanitizeChannelName(orgName)}-flowglad-concierge`

  let channel: APIChannel | null = null

  // Try to find by existing channel ID first (fast lookup)
  if (existingChannelId) {
    channel = await fetchChannelById(rest, existingChannelId)
  }

  // Create if doesn't exist
  let isNewChannel = false
  if (!channel) {
    channel = await createPrivateChannel(
      rest,
      config.guildId,
      channelName,
      config
    )
    isNewChannel = true
  }

  // Post welcome message for newly created channels
  if (isNewChannel) {
    await postWelcomeMessage(rest, channel.id, orgName, config)
  }

  // Get or create invite
  const inviteUrl = await getOrCreateInvite(rest, channel.id)

  return {
    channelId: channel.id,
    inviteUrl,
  }
}
