import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  getDiscordConfig,
  parseCohortNumber,
  sanitizeChannelName,
  selectCategoryForChannel,
} from './discord'

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

  describe('parseCohortNumber', () => {
    it('parses cohort number from category name with matching prefix', () => {
      expect(
        parseCohortNumber('Concierge Cohort 3', 'Concierge Cohort')
      ).toBe(3)
      expect(
        parseCohortNumber('Concierge Cohort 1', 'Concierge Cohort')
      ).toBe(1)
      expect(
        parseCohortNumber('Concierge Cohort 42', 'Concierge Cohort')
      ).toBe(42)
    })

    it('returns null when prefix does not match', () => {
      expect(
        parseCohortNumber('Other Category 3', 'Concierge Cohort')
      ).toBe(null)
    })

    it('returns null when suffix is not a number', () => {
      expect(
        parseCohortNumber('Concierge Cohort abc', 'Concierge Cohort')
      ).toBe(null)
      expect(
        parseCohortNumber('Concierge Cohort', 'Concierge Cohort')
      ).toBe(null)
    })
  })

  describe('selectCategoryForChannel', () => {
    it('selects existing category when one has space available', () => {
      const result = selectCategoryForChannel([
        { id: 'cat1', cohortNum: 1, childCount: 49 },
      ])

      expect(result).toEqual({ action: 'use_existing', id: 'cat1' })
    })

    it('creates new category when all existing categories are full', () => {
      const result = selectCategoryForChannel([
        { id: 'cat1', cohortNum: 1, childCount: 50 },
        { id: 'cat2', cohortNum: 2, childCount: 50 },
      ])

      expect(result).toEqual({ action: 'create_new', cohortNum: 3 })
    })

    it('creates category with cohortNum 1 when no categories exist', () => {
      const result = selectCategoryForChannel([])

      expect(result).toEqual({ action: 'create_new', cohortNum: 1 })
    })

    it('prefers lower cohort numbers when multiple categories have space', () => {
      const result = selectCategoryForChannel([
        { id: 'cat2', cohortNum: 2, childCount: 10 },
        { id: 'cat1', cohortNum: 1, childCount: 10 },
        { id: 'cat3', cohortNum: 3, childCount: 10 },
      ])

      expect(result).toEqual({ action: 'use_existing', id: 'cat1' })
    })

    it('skips full categories and uses first available one by cohort order', () => {
      const result = selectCategoryForChannel([
        { id: 'cat1', cohortNum: 1, childCount: 50 },
        { id: 'cat2', cohortNum: 2, childCount: 50 },
        { id: 'cat3', cohortNum: 3, childCount: 25 },
      ])

      expect(result).toEqual({ action: 'use_existing', id: 'cat3' })
    })

    it('respects custom channel limit parameter', () => {
      const result = selectCategoryForChannel(
        [{ id: 'cat1', cohortNum: 1, childCount: 5 }],
        5 // custom limit
      )

      expect(result).toEqual({ action: 'create_new', cohortNum: 2 })
    })

    it('creates category with next cohort number even with gaps in numbering', () => {
      const result = selectCategoryForChannel([
        { id: 'cat1', cohortNum: 1, childCount: 50 },
        { id: 'cat5', cohortNum: 5, childCount: 50 },
      ])

      expect(result).toEqual({ action: 'create_new', cohortNum: 6 })
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
