import { describe, expect, it } from 'bun:test'
import { sanitizeChannelName } from './discord'

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

  describe('getOrCreateConciergeChannel', () => {
    it.skip('creates a new channel when none exists', async () => {
      // PENDING: Patch 5
      // setup: mock discord.js client, guild with no matching channel
      // expectation: creates channel with correct name and permissions, returns invite URL
    })

    it.skip('finds existing channel by ID and returns invite', async () => {
      // PENDING: Patch 5
      // setup: mock discord.js client, pass existing channel ID
      // expectation: does not create new channel, returns existing invite URL
    })

    it.skip('throws error when bot token is missing', async () => {
      // PENDING: Patch 5
      // setup: unset DISCORD_BOT_TOKEN
      // expectation: throws Error with message about missing token
    })

    it.skip('throws error when guild ID is missing', async () => {
      // PENDING: Patch 5
      // setup: unset DISCORD_GUILD_ID
      // expectation: throws Error with message about missing guild ID
    })
  })
})
