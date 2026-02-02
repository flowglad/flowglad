import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { getDiscordConfig, sanitizeChannelName } from './discord'

describe('discord', () => {
  describe('sanitizeChannelName', () => {
    it('converts to lowercase and replaces spaces with hyphens', () => {
      expect(sanitizeChannelName('My Company')).toBe('my-company')
    })

    it('replaces special characters with hyphens and collapses them', () => {
      expect(sanitizeChannelName("Acme's LLC (Test)")).toBe(
        'acme-s-llc-test'
      )
    })

    it('collapses multiple hyphens into one', () => {
      expect(sanitizeChannelName('foo---bar')).toBe('foo-bar')
    })

    it('removes leading and trailing hyphens', () => {
      expect(sanitizeChannelName('-test-')).toBe('test')
    })

    it('truncates to 80 characters', () => {
      const longName = 'a'.repeat(100)
      expect(sanitizeChannelName(longName).length).toBe(80)
    })

    it('handles empty string', () => {
      expect(sanitizeChannelName('')).toBe('')
    })

    it('replaces unicode characters with hyphens', () => {
      expect(sanitizeChannelName('Café München')).toBe('caf-m-nchen')
    })
  })

  describe('getDiscordConfig', () => {
    let originalBotToken: string | undefined
    let originalGuildId: string | undefined

    beforeEach(() => {
      originalBotToken = process.env.DISCORD_BOT_TOKEN
      originalGuildId = process.env.DISCORD_GUILD_ID
    })

    afterEach(() => {
      if (originalBotToken !== undefined) {
        process.env.DISCORD_BOT_TOKEN = originalBotToken
      } else {
        delete process.env.DISCORD_BOT_TOKEN
      }
      if (originalGuildId !== undefined) {
        process.env.DISCORD_GUILD_ID = originalGuildId
      } else {
        delete process.env.DISCORD_GUILD_ID
      }
    })

    it('throws error when bot token is missing', () => {
      delete process.env.DISCORD_BOT_TOKEN
      process.env.DISCORD_GUILD_ID = 'test-guild-id'

      expect(() => getDiscordConfig()).toThrow(
        'DISCORD_BOT_TOKEN environment variable is required'
      )
    })

    it('throws error when guild ID is missing', () => {
      process.env.DISCORD_BOT_TOKEN = 'test-bot-token'
      delete process.env.DISCORD_GUILD_ID

      expect(() => getDiscordConfig()).toThrow(
        'DISCORD_GUILD_ID environment variable is required'
      )
    })

    it('returns config when both required env vars are set', () => {
      process.env.DISCORD_BOT_TOKEN = 'test-bot-token'
      process.env.DISCORD_GUILD_ID = 'test-guild-id'

      const config = getDiscordConfig()

      expect(config.botToken).toBe('test-bot-token')
      expect(config.guildId).toBe('test-guild-id')
      expect(config.conciergeCategoryPrefix).toBe('Concierge Cohort')
    })
  })

  describe('getOrCreateConciergeChannel', () => {
    it.skip('creates a new channel when none exists', async () => {
      // Requires mocking Discord REST API - better suited for manual integration testing
      // setup: mock discord.js client, guild with no matching channel
      // expectation: creates channel with correct name and permissions, returns invite URL
    })

    it.skip('finds existing channel by ID and returns invite', async () => {
      // Requires mocking Discord REST API - better suited for manual integration testing
      // setup: mock discord.js client, pass existing channel ID
      // expectation: does not create new channel, returns existing invite URL
    })
  })
})
