import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearProjectConfig,
  getProjectConfigDir,
  getProjectConfigPath,
  loadProjectConfig,
  type ProjectConfig,
  saveProjectConfig,
} from './projectConfig'

describe('CLI project configuration', () => {
  let testConfigDir: string
  let originalConfigDir: string | undefined

  beforeEach(async () => {
    // Save original env var
    originalConfigDir = process.env.FLOWGLAD_PROJECT_CONFIG_DIR

    // Create a unique test directory
    testConfigDir = join(
      tmpdir(),
      `flowglad-project-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    await mkdir(testConfigDir, { recursive: true })

    // Set env var to use test directory
    process.env.FLOWGLAD_PROJECT_CONFIG_DIR = testConfigDir
  })

  afterEach(async () => {
    // Restore original env var
    if (originalConfigDir !== undefined) {
      process.env.FLOWGLAD_PROJECT_CONFIG_DIR = originalConfigDir
    } else {
      delete process.env.FLOWGLAD_PROJECT_CONFIG_DIR
    }

    // Clean up test directory
    try {
      await rm(testConfigDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  const createTestConfig = (
    overrides: Partial<ProjectConfig> = {}
  ): ProjectConfig => ({
    organizationId: 'org_test_123',
    organizationName: 'Test Organization',
    pricingModelId: 'pm_test_456',
    pricingModelName: 'Starter Plan',
    livemode: false,
    ...overrides,
  })

  describe('getProjectConfigDir', () => {
    it('returns the path set by FLOWGLAD_PROJECT_CONFIG_DIR environment variable', () => {
      expect(getProjectConfigDir()).toBe(testConfigDir)
    })

    it('returns .flowglad relative to cwd when FLOWGLAD_PROJECT_CONFIG_DIR is not set', () => {
      delete process.env.FLOWGLAD_PROJECT_CONFIG_DIR

      expect(getProjectConfigDir()).toBe(
        join(process.cwd(), '.flowglad')
      )
    })
  })

  describe('getProjectConfigPath', () => {
    it('returns config.json inside the project config directory', () => {
      expect(getProjectConfigPath()).toBe(
        join(testConfigDir, 'config.json')
      )
    })
  })

  describe('saveProjectConfig', () => {
    it('writes config file with correct JSON content and creates directory if needed', async () => {
      // Remove the test directory so saveProjectConfig has to create it
      await rm(testConfigDir, { recursive: true })

      const config = createTestConfig()

      await saveProjectConfig(config)

      // Verify content is correct
      const loaded = await loadProjectConfig()
      expect(loaded).toEqual(config)
    })

    it('overwrites existing config file when saving new config', async () => {
      const oldConfig = createTestConfig({
        organizationName: 'Old Org',
      })
      const newConfig = createTestConfig({
        organizationName: 'New Org',
      })

      await saveProjectConfig(oldConfig)
      await saveProjectConfig(newConfig)

      const loaded = await loadProjectConfig()
      expect(loaded?.organizationName).toBe('New Org')
    })

    it('saves config with optional updatedAt field', async () => {
      const config = createTestConfig({
        updatedAt: '2025-01-15T10:30:00.000Z',
      })

      await saveProjectConfig(config)

      const loaded = await loadProjectConfig()
      expect(loaded).toEqual(config)
      expect(loaded?.updatedAt).toBe('2025-01-15T10:30:00.000Z')
    })

    it('saves config with livemode true', async () => {
      const config = createTestConfig({
        livemode: true,
      })

      await saveProjectConfig(config)

      const loaded = await loadProjectConfig()
      expect(loaded?.livemode).toBe(true)
    })
  })

  describe('loadProjectConfig', () => {
    it('returns null when no config file exists', async () => {
      const result = await loadProjectConfig()

      expect(result).toBeNull()
    })

    it('returns parsed config when file exists with valid JSON', async () => {
      const config = createTestConfig()
      await saveProjectConfig(config)

      const loaded = await loadProjectConfig()

      expect(loaded).toEqual(config)
      expect(loaded?.organizationId).toBe('org_test_123')
      expect(loaded?.organizationName).toBe('Test Organization')
      expect(loaded?.pricingModelId).toBe('pm_test_456')
      expect(loaded?.pricingModelName).toBe('Starter Plan')
      expect(loaded?.livemode).toBe(false)
    })

    it('returns null when config file contains invalid JSON', async () => {
      const configPath = getProjectConfigPath()

      // Write corrupted JSON directly
      await writeFile(configPath, 'not valid json {{{')

      const result = await loadProjectConfig()

      expect(result).toBeNull()
    })

    it('returns null when config file has valid JSON but missing required fields', async () => {
      const configPath = getProjectConfigPath()

      // Write JSON missing required fields
      await writeFile(
        configPath,
        JSON.stringify({ organizationId: 'org_123' })
      )

      const result = await loadProjectConfig()

      expect(result).toBeNull()
    })

    it('returns null when config file has valid JSON but wrong field types', async () => {
      const configPath = getProjectConfigPath()

      // Write JSON with wrong types (livemode should be boolean, not string)
      await writeFile(
        configPath,
        JSON.stringify({
          organizationId: 'org_123',
          organizationName: 'Test Org',
          pricingModelId: 'pm_123',
          pricingModelName: 'Plan',
          livemode: 'false', // Wrong type
        })
      )

      const result = await loadProjectConfig()

      expect(result).toBeNull()
    })

    it('returns config when updatedAt is not present', async () => {
      const config = createTestConfig()

      await saveProjectConfig(config)

      const loaded = await loadProjectConfig()

      expect(loaded?.organizationId).toBe('org_test_123')
      expect(loaded?.updatedAt).toBeUndefined()
    })
  })

  describe('clearProjectConfig', () => {
    it('removes the config file when it exists', async () => {
      const config = createTestConfig()
      await saveProjectConfig(config)

      // Verify file exists
      const loadedBefore = await loadProjectConfig()
      expect(loadedBefore).toEqual(config)

      await clearProjectConfig()

      // Verify file is gone
      const loadedAfter = await loadProjectConfig()
      expect(loadedAfter).toBeNull()
    })

    it('does not throw when config file does not exist', async () => {
      // Ensure no config exists
      const loaded = await loadProjectConfig()
      expect(loaded).toBeNull()

      // Should complete without throwing
      await clearProjectConfig()
    })
  })
})
