/**
 * Link command tests.
 *
 * Note: These tests use vitest-specific APIs (vi.stubGlobal, vi.mock).
 * Run with `bun run test`, not `bun test` directly.
 *
 * MOCKING RATIONALE: This test file mocks @clack/prompts for interactive
 * terminal input. While the project guidelines discourage mocking non-network
 * functions, CLI testing is a special case where:
 * 1. Interactive prompts cannot be programmatically controlled in automated tests
 * 2. The prompt library is an I/O boundary, similar to network calls
 * 3. The core business logic (API calls, credential storage) uses real implementations
 *
 * An alternative would be dependency injection for prompt functions, but the
 * added complexity is not warranted for a CLI tool where the prompts are
 * thin wrappers around user selection.
 */
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  loadCredentials,
  type StoredCredentials,
  saveCredentials,
} from '../auth/config'
import { loadProjectConfig } from '../projectConfig'
import { linkFlow } from './link'

// Mock fetch globally
const mockFetch = vi.fn()
const originalFetch = globalThis.fetch
vi.stubGlobal('fetch', mockFetch)

// Mock @clack/prompts - using vi.hoisted to create the mocks before vi.mock runs
const { mockSelect, mockIsCancel } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockIsCancel: vi.fn().mockReturnValue(false),
}))

vi.mock('@clack/prompts', () => ({
  select: mockSelect,
  isCancel: mockIsCancel,
}))

describe('link command', () => {
  let testConfigDir: string
  let testProjectConfigDir: string
  let originalConfigDir: string | undefined
  let originalProjectConfigDir: string | undefined
  let originalApiUrl: string | undefined

  // Console capture
  let consoleLogOutput: string[]
  let consoleErrorOutput: string[]
  const originalConsoleLog = console.log
  const originalConsoleError = console.error

  // Process.exit capture
  let exitCode: number | null
  const originalProcessExit = process.exit

  const createTestCredentials = (
    overrides: Partial<StoredCredentials> = {}
  ): StoredCredentials => ({
    refreshToken: 'ba_session_test_token_123',
    refreshTokenExpiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000,
    userId: 'user_test_123',
    email: 'test@example.com',
    name: 'Test User',
    ...overrides,
  })

  const mockOrganizationsResponse = {
    organizations: [
      {
        id: 'org_1',
        name: 'Organization One',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 'org_2',
        name: 'Organization Two',
        createdAt: '2025-01-02T00:00:00.000Z',
      },
    ],
  }

  const mockPricingModelsResponse = {
    pricingModels: [
      {
        id: 'pm_1',
        name: 'Starter Plan',
        isDefault: true,
        updatedAt: '2025-01-15T00:00:00.000Z',
      },
      {
        id: 'pm_2',
        name: 'Pro Plan',
        isDefault: false,
        updatedAt: '2025-01-15T00:00:00.000Z',
      },
    ],
  }

  const mockAccessTokenResponse = {
    accessToken: 'unkey_test_token_xyz',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  }

  beforeEach(async () => {
    // Save original env vars
    originalConfigDir = process.env.FLOWGLAD_CONFIG_DIR
    originalProjectConfigDir = process.env.FLOWGLAD_PROJECT_CONFIG_DIR
    originalApiUrl = process.env.FLOWGLAD_API_URL

    // Create unique test directories
    const uniqueId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    testConfigDir = join(
      tmpdir(),
      `flowglad-link-test-config-${uniqueId}`
    )
    testProjectConfigDir = join(
      tmpdir(),
      `flowglad-link-test-project-${uniqueId}`
    )
    await mkdir(testConfigDir, { recursive: true })
    await mkdir(testProjectConfigDir, { recursive: true })

    // Set env vars for testing
    process.env.FLOWGLAD_CONFIG_DIR = testConfigDir
    process.env.FLOWGLAD_PROJECT_CONFIG_DIR = testProjectConfigDir
    process.env.FLOWGLAD_API_URL = 'https://test.flowglad.com'

    // Reset mocks
    mockFetch.mockReset()
    mockSelect.mockReset()
    mockIsCancel.mockReset()
    mockIsCancel.mockReturnValue(false)

    // Capture console output
    consoleLogOutput = []
    consoleErrorOutput = []
    console.log = (...args: unknown[]) => {
      consoleLogOutput.push(args.map(String).join(' '))
    }
    console.error = (...args: unknown[]) => {
      consoleErrorOutput.push(args.map(String).join(' '))
    }

    // Capture process.exit
    exitCode = null
    process.exit = ((code?: number) => {
      exitCode = code ?? 0
    }) as typeof process.exit
  })

  afterEach(async () => {
    // Restore original env vars
    if (originalConfigDir !== undefined) {
      process.env.FLOWGLAD_CONFIG_DIR = originalConfigDir
    } else {
      delete process.env.FLOWGLAD_CONFIG_DIR
    }
    if (originalProjectConfigDir !== undefined) {
      process.env.FLOWGLAD_PROJECT_CONFIG_DIR =
        originalProjectConfigDir
    } else {
      delete process.env.FLOWGLAD_PROJECT_CONFIG_DIR
    }
    if (originalApiUrl !== undefined) {
      process.env.FLOWGLAD_API_URL = originalApiUrl
    } else {
      delete process.env.FLOWGLAD_API_URL
    }

    // Restore console and process.exit
    console.log = originalConsoleLog
    console.error = originalConsoleError
    process.exit = originalProcessExit

    // Clean up test directories
    try {
      await rm(testConfigDir, { recursive: true, force: true })
      await rm(testProjectConfigDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  afterAll(() => {
    // Restore global fetch
    globalThis.fetch = originalFetch
  })

  it('prompts user to select organization when multiple orgs are available', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    // Mock API responses
    mockFetch
      // list-organizations
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOrganizationsResponse),
      })
      // list-pricing-models
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPricingModelsResponse),
      })
      // access-token
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAccessTokenResponse),
      })

    // Mock user selecting org_1 then pm_1
    mockSelect
      .mockResolvedValueOnce('org_1')
      .mockResolvedValueOnce('pm_1')

    await linkFlow({})

    // Verify org selection prompt was called with correct options
    expect(mockSelect).toHaveBeenCalledTimes(2)
    expect(mockSelect).toHaveBeenNthCalledWith(1, {
      message: 'Select an organization:',
      options: [
        { label: 'Organization One', value: 'org_1' },
        { label: 'Organization Two', value: 'org_2' },
      ],
    })
  })

  it('prompts user to select pricing model after org selection', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    // Mock API responses
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOrganizationsResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPricingModelsResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAccessTokenResponse),
      })

    mockSelect
      .mockResolvedValueOnce('org_1')
      .mockResolvedValueOnce('pm_1')

    await linkFlow({})

    // Verify PM selection prompt was called with correct options (including default indicator)
    expect(mockSelect).toHaveBeenNthCalledWith(2, {
      message: 'Select a pricing model:',
      options: [
        { label: 'Starter Plan (default)', value: 'pm_1' },
        { label: 'Pro Plan', value: 'pm_2' },
      ],
    })
  })

  it('saves selected org and PM to project config file', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOrganizationsResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPricingModelsResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAccessTokenResponse),
      })

    mockSelect
      .mockResolvedValueOnce('org_1')
      .mockResolvedValueOnce('pm_2')

    await linkFlow({})

    // Verify project config was saved
    const projectConfig = await loadProjectConfig()
    expect(projectConfig).toEqual({
      organizationId: 'org_1',
      organizationName: 'Organization One',
      pricingModelId: 'pm_2',
      pricingModelName: 'Pro Plan',
      livemode: false,
    })

    // Verify success message
    const output = consoleLogOutput.join('\n')
    expect(output).toContain('Linked to Organization One / Pro Plan')
    expect(output).toContain('Config saved to .flowglad/config.json')
  })

  it('errors when user has no organizations', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ organizations: [] }),
    })

    await linkFlow({})

    expect(consoleErrorOutput.join('\n')).toContain(
      'No organizations found.'
    )
    expect(exitCode).toBe(1)
  })

  it('generates and stores access token after selection', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOrganizationsResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPricingModelsResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAccessTokenResponse),
      })

    mockSelect
      .mockResolvedValueOnce('org_1')
      .mockResolvedValueOnce('pm_1')

    await linkFlow({})

    // Verify access token endpoint was called
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'https://test.flowglad.com/api/cli/access-token',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer ba_session_test_token_123',
        }),
        body: JSON.stringify({
          organizationId: 'org_1',
          pricingModelId: 'pm_1',
          livemode: false,
        }),
      })
    )

    // Verify credentials were updated with access token
    const savedCredentials = await loadCredentials()
    expect(savedCredentials?.accessToken).toBe('unkey_test_token_xyz')
    expect(savedCredentials?.organizationId).toBe('org_1')
    expect(savedCredentials?.pricingModelId).toBe('pm_1')
    expect(savedCredentials?.livemode).toBe(false)
  })

  it('skips both prompts when --pm alone is provided and looks up org', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    // Mock list-pricing-models returning single PM with org info
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            organization: { id: 'org_1', name: 'Organization One' },
            pricingModels: [
              mockPricingModelsResponse.pricingModels[0],
            ],
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAccessTokenResponse),
      })

    await linkFlow({ pm: 'pm_1' })

    // Verify no prompts were shown
    expect(mockSelect).not.toHaveBeenCalled()

    // Verify org was looked up from PM
    const output = consoleLogOutput.join('\n')
    expect(output).toContain('Using organization: Organization One')
    expect(output).toContain(
      'Linked to Organization One / Starter Plan'
    )

    // Verify project config was saved correctly
    const projectConfig = await loadProjectConfig()
    expect(projectConfig?.organizationId).toBe('org_1')
    expect(projectConfig?.pricingModelId).toBe('pm_1')
  })

  it('validates PM belongs to org when both --org and --pm provided', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    // Mock list-pricing-models returning PMs for org (pm_999 not in list)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPricingModelsResponse),
    })

    await linkFlow({ org: 'org_1', pm: 'pm_999' })

    // Verify error about PM not found in org
    expect(consoleErrorOutput.join('\n')).toContain(
      'Pricing model pm_999 not found in this organization.'
    )
    expect(exitCode).toBe(1)
  })

  it('errors when not logged in', async () => {
    // No credentials saved

    await linkFlow({})

    expect(consoleErrorOutput.join('\n')).toContain(
      'Not logged in. Run `flowglad login` first.'
    )
    expect(exitCode).toBe(1)
  })

  it('skips org prompt when --org is provided', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    mockFetch
      // list-pricing-models (org prompt skipped, so this is first call)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPricingModelsResponse),
      })
      // list-organizations (to get org name)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOrganizationsResponse),
      })
      // access-token
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAccessTokenResponse),
      })

    // Only PM prompt should be shown
    mockSelect.mockResolvedValueOnce('pm_1')

    await linkFlow({ org: 'org_1' })

    // Verify only PM selection was prompted
    expect(mockSelect).toHaveBeenCalledTimes(1)
    expect(mockSelect).toHaveBeenCalledWith({
      message: 'Select a pricing model:',
      options: expect.any(Array),
    })
  })

  it('exits when user cancels org selection', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockOrganizationsResponse),
    })

    // User cancels
    mockSelect.mockResolvedValueOnce(Symbol.for('cancel'))
    mockIsCancel.mockReturnValue(true)

    await linkFlow({})

    expect(exitCode).toBe(1)
  })

  it('exits when user cancels PM selection', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOrganizationsResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPricingModelsResponse),
      })

    // User selects org then cancels PM
    mockSelect
      .mockResolvedValueOnce('org_1')
      .mockResolvedValueOnce(Symbol.for('cancel'))
    mockIsCancel.mockReturnValueOnce(false).mockReturnValueOnce(true)

    await linkFlow({})

    expect(exitCode).toBe(1)
  })

  it('handles 404 error when --pm references non-existent pricing model', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({ message: 'Pricing model not found' }),
    })

    await linkFlow({ pm: 'pm_nonexistent' })

    expect(consoleErrorOutput.join('\n')).toContain(
      'Pricing model not found'
    )
    expect(exitCode).toBe(1)
  })

  it('handles 403 error when user lacks access to pricing model', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          message: 'You do not have access to this pricing model',
        }),
    })

    await linkFlow({ pm: 'pm_forbidden' })

    expect(consoleErrorOutput.join('\n')).toContain(
      'You do not have access to this pricing model'
    )
    expect(exitCode).toBe(1)
  })

  it('errors when organization has no test pricing models', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOrganizationsResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ pricingModels: [] }),
      })

    mockSelect.mockResolvedValueOnce('org_1')

    await linkFlow({})

    expect(consoleErrorOutput.join('\n')).toContain(
      'No test pricing models found.'
    )
    expect(exitCode).toBe(1)
  })

  it('skips both prompts when both --org and --pm are provided and PM exists in org', async () => {
    const credentials = createTestCredentials()
    await saveCredentials(credentials)

    mockFetch
      // list-pricing-models with org filter
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPricingModelsResponse),
      })
      // list-organizations (to get org name)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockOrganizationsResponse),
      })
      // access-token
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAccessTokenResponse),
      })

    await linkFlow({ org: 'org_1', pm: 'pm_1' })

    // Verify no prompts were shown
    expect(mockSelect).not.toHaveBeenCalled()

    // Verify success
    const output = consoleLogOutput.join('\n')
    expect(output).toContain(
      'Linked to Organization One / Starter Plan'
    )
  })
})
