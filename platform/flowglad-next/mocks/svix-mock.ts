/**
 * Svix Utility Mock
 *
 * Mocks @/utils/svix to prevent loading svix SDK.
 * Svix webhook functions are mocked with working implementations.
 * Tests that need specific Svix behavior can override these mocks.
 */
import { mock } from 'bun:test'

const mockFindOrCreateSvixApplication =
  mock<
    (params: {
      organization: { id: string }
      livemode: boolean
    }) => Promise<{
      id: string
      name: string
    }>
  >()
mockFindOrCreateSvixApplication.mockImplementation(
  async (params) => ({
    id: `app_mock_${params.organization.id}_${params.livemode ? 'live' : 'test'}`,
    name: `Mock Application - ${params.organization.id}`,
  })
)

const mockCreateSvixEndpoint =
  mock<
    (params: {
      organization: { id: string }
      webhook: { id: string; url: string; livemode: boolean }
    }) => Promise<{ id: string; url: string }>
  >()
mockCreateSvixEndpoint.mockImplementation(async (params) => ({
  id: `endpoint_mock_${params.webhook.id}`,
  url: params.webhook.url,
}))

const mockUpdateSvixEndpoint =
  mock<
    (params: {
      webhook: {
        id: string
        url: string
        livemode: boolean
        active: boolean
      }
      organization: { id: string }
    }) => Promise<{ id: string; url: string }>
  >()
mockUpdateSvixEndpoint.mockImplementation(async (params) => ({
  id: `endpoint_mock_${params.webhook.id}`,
  url: params.webhook.url,
}))

const mockSendSvixEvent =
  mock<
    (params: {
      event: {
        type: string
        hash: string
        payload: unknown
        livemode: boolean
      }
      organization: { id: string }
    }) => Promise<void>
  >()
mockSendSvixEvent.mockResolvedValue(undefined)

const mockGetSvixSigningSecret =
  mock<
    (params: {
      webhook: { id: string; livemode: boolean }
      organization: { id: string }
    }) => Promise<{ key: string }>
  >()
mockGetSvixSigningSecret.mockResolvedValue({
  key: 'whsec_mock_signing_secret',
})

// Store mocks globally for tests that need to override behavior
declare global {
  // eslint-disable-next-line no-var
  var __mockFindOrCreateSvixApplication: typeof mockFindOrCreateSvixApplication
  // eslint-disable-next-line no-var
  var __mockCreateSvixEndpoint: typeof mockCreateSvixEndpoint
  // eslint-disable-next-line no-var
  var __mockUpdateSvixEndpoint: typeof mockUpdateSvixEndpoint
  // eslint-disable-next-line no-var
  var __mockSendSvixEvent: typeof mockSendSvixEvent
  // eslint-disable-next-line no-var
  var __mockGetSvixSigningSecret: typeof mockGetSvixSigningSecret
}
globalThis.__mockFindOrCreateSvixApplication =
  mockFindOrCreateSvixApplication
globalThis.__mockCreateSvixEndpoint = mockCreateSvixEndpoint
globalThis.__mockUpdateSvixEndpoint = mockUpdateSvixEndpoint
globalThis.__mockSendSvixEvent = mockSendSvixEvent
globalThis.__mockGetSvixSigningSecret = mockGetSvixSigningSecret

export const svixMockExports = {
  findOrCreateSvixApplication: mockFindOrCreateSvixApplication,
  createSvixEndpoint: mockCreateSvixEndpoint,
  updateSvixEndpoint: mockUpdateSvixEndpoint,
  sendSvixEvent: mockSendSvixEvent,
  getSvixSigningSecret: mockGetSvixSigningSecret,
  // Pure functions that don't hit the API can use pass-through implementations
  getSvixApplicationId: (params: {
    organization: { id: string }
    livemode: boolean
  }) =>
    `app_mock_${params.organization.id}_${params.livemode ? 'live' : 'test'}`,
  getSvixEndpointId: (params: {
    organization: { id: string }
    webhook: { id: string }
    livemode: boolean
  }) => `endpoint_mock_${params.webhook.id}`,
  // Block direct svix() access
  svix: () => {
    throw new Error(
      '[Test] Direct Svix client access is blocked. Use the mocked functions instead.'
    )
  },
}
