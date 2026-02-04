/**
 * Svix webhook dispatch utilities.
 *
 * Svix is a third-party service that handles reliable webhook delivery to customer endpoints.
 * This module wraps Svix API calls to manage applications (per-organization containers),
 * endpoints (customer-configured URLs), and message dispatch. All operations are instrumented
 * with OpenTelemetry tracing to measure webhook-related latency.
 *
 * @see https://www.svix.com/
 */

import type { Event } from '@db-core/schema/events'
import type { Organization } from '@db-core/schema/organizations'
import type { Webhook } from '@db-core/schema/webhooks'
import { type ApplicationOut, Svix } from 'svix'
import { ApiException } from 'svix/dist/util'
import {
  type Checkpoint,
  svixTraced,
  tracedWithCheckpoints,
} from '@/utils/tracing'
import { generateHmac } from './backendCore'
import core from './core'

/**
 * Create a Svix client configured from the `SVIX_API_KEY` environment variable.
 *
 * When `SVIX_MOCK_HOST` is set, the client uses that URL as the server endpoint.
 * This enables testing against a mock server (e.g., flowglad-mock-server) instead
 * of the production Svix API.
 *
 * @returns A Svix client instance initialized with the value of `SVIX_API_KEY`.
 */
export function svix() {
  return new Svix(
    core.IS_TEST
      ? 'test_svix_api_key'
      : core.envVariable('SVIX_API_KEY'),
    {
      serverUrl: process.env.SVIX_MOCK_HOST || undefined,
    }
  )
}

function generateSvixId({
  prefix,
  id,
  organization,
  livemode,
}: {
  prefix: string
  id: string
  organization: Organization.Record
  livemode: boolean
}) {
  if (!organization.securitySalt) {
    // biome-ignore lint/plugin: Domain error for boundary contexts to catch and handle
    throw new Error(
      `No security salt found for organization ${organization.id}`
    )
  }
  const modeStr = livemode ? 'live' : 'test'
  const data = `${prefix}_${id}_${modeStr}`
  const hmac = generateHmac({
    data,
    salt: organization.securitySalt!,
    key: core.IS_TEST
      ? 'test_hmac_key_for_svix'
      : core.envVariable('HMAC_KEY_SVIX'),
  })
  return `${prefix}_${id}_${modeStr}_${hmac}`
}

/**
 * Generate a Svix application ID for the given organization and livemode.
 *
 * When `pricingModelId` is provided, generates a PM-scoped app ID:
 *   `app_${orgId}_${pricingModelId}_${livemode}_${hmac}`
 *
 * When `pricingModelId` is not provided (legacy), generates:
 *   `app_${orgId}_${livemode}_${hmac}`
 *
 * @param organization - Organization record used to compute the Svix application ID
 * @param livemode - When `true`, use the live-mode application ID; when `false`, use test-mode
 * @param pricingModelId - Optional pricing model ID for PM-scoped applications
 * @returns The deterministic Svix application ID
 */
export function getSvixApplicationId(params: {
  organization: Organization.Record
  livemode: boolean
  pricingModelId?: string // Optional for backward compat with legacy apps
}) {
  const { organization, livemode, pricingModelId } = params
  // When pricingModelId is provided, include it in the ID base
  // This creates PM-scoped app IDs like: app_${orgId}_${pmId}_${livemode}_${hmac}
  // When not provided, creates legacy IDs like: app_${orgId}_${livemode}_${hmac}
  const idBase = pricingModelId
    ? `${organization.id}_${pricingModelId}`
    : organization.id
  return generateSvixId({
    prefix: 'app',
    id: idBase,
    organization,
    livemode,
  })
}

export function getSvixEndpointId(params: {
  organization: Organization.Record
  webhook: Webhook.Record
  livemode: boolean
}) {
  const { organization, webhook, livemode } = params
  return generateSvixId({
    prefix: 'endpoint',
    id: webhook.id,
    organization,
    livemode,
  })
}

/**
 * Check if a Svix application exists by ID.
 *
 * This is used to check for the existence of legacy (org+livemode) or
 * PM-scoped (org+pm+livemode) Svix applications without creating them.
 *
 * @param applicationId - The Svix application ID to check
 * @returns `true` if the application exists, `false` if not found
 * @throws On other errors (network, auth, rate limits, etc.)
 */
export const checkSvixApplicationExists = async (
  applicationId: string
): Promise<boolean> => {
  try {
    await svix().application.get(applicationId)
    return true
  } catch (error) {
    if (error instanceof ApiException && error.code === 404) {
      return false
    }
    // biome-ignore lint/plugin: Re-throw unexpected errors after handling known error types
    throw error
  }
}

/**
 * Core findOrCreateSvixApplication logic with checkpoint callback for tracing.
 */
const findOrCreateSvixApplicationCore = async (
  checkpoint: Checkpoint,
  params: {
    organization: Organization.Record
    livemode: boolean
    pricingModelId?: string // Optional for backward compat
  }
): Promise<ApplicationOut> => {
  const { organization, livemode, pricingModelId } = params
  const modeSlug = livemode ? 'live' : 'test'
  const applicationId = getSvixApplicationId({
    organization,
    livemode,
    pricingModelId,
  })

  let app: ApplicationOut | undefined
  try {
    app = await svix().application.get(applicationId)
  } catch (error) {
    // Only treat 404 (not found) as a signal to create a new application
    // Rethrow other errors (network, auth, rate limits, etc.)
    if (error instanceof ApiException && error.code === 404) {
      // Application not found, will create below
    } else {
      // eslint-disable-next-line no-console
      console.error('Svix application.get error', error)
      // biome-ignore lint/plugin: Re-throw unexpected errors after handling known error types
      throw error
    }
  }
  if (app) {
    checkpoint({ 'svix.created': false })
    return app
  }
  checkpoint({ 'svix.created': true })
  return await svix().application.create({
    name: `${organization.name} - (${organization.id} - ${modeSlug})`,
    uid: applicationId,
  })
}

/**
 * Ensures a Svix application exists for the given organization and livemode.
 *
 * Attempts to fetch a Svix application by its deterministic ID and creates a new application with a name derived from the organization if no existing application is found. The OpenTelemetry span used for the operation is annotated with the attribute `svix.created` set to `true` when a new application is created and `false` when an existing application is returned.
 *
 * When `pricingModelId` is provided, creates/finds a PM-scoped application.
 * When not provided, creates/finds a legacy org+livemode application.
 *
 * @param organization - Organization record used to compute the Svix application ID and display name
 * @param livemode - When `true`, use the live-mode application ID; when `false`, use the test-mode application ID
 * @param pricingModelId - Optional pricing model ID for PM-scoped applications (backward compat)
 * @returns The existing or newly created Svix application
 */
export const findOrCreateSvixApplication = tracedWithCheckpoints(
  {
    options: {
      spanName: 'svix.application.findOrCreate',
      tracerName: 'svix',
    },
    extractArgsAttributes: (params) => ({
      'svix.org_id': params.organization.id,
    }),
  },
  findOrCreateSvixApplicationCore
)

interface CreateSvixEndpointParams {
  organization: Organization.Record
  webhook: Webhook.Record
}

/**
 * Core createSvixEndpoint logic without tracing.
 *
 * When the webhook has a `pricingModelId`, uses PM-scoped Svix application.
 * Otherwise falls back to legacy org+livemode application format.
 */
const createSvixEndpointCore = async (
  params: CreateSvixEndpointParams
) => {
  const { organization, webhook } = params
  const applicationId = getSvixApplicationId({
    organization,
    livemode: webhook.livemode,
    pricingModelId: webhook.pricingModelId,
  })
  if (!applicationId) {
    // biome-ignore lint/plugin: Domain error for boundary contexts to catch and handle
    throw new Error('No application ID found')
  }
  await findOrCreateSvixApplication({
    organization,
    livemode: webhook.livemode,
    pricingModelId: webhook.pricingModelId,
  })
  const endpointId = getSvixEndpointId({
    organization,
    webhook,
    livemode: webhook.livemode,
  })
  try {
    const endpoint = await svix().endpoint.create(applicationId, {
      uid: endpointId,
      url: webhook.url,
      filterTypes: webhook.filterTypes,
    })
    return endpoint
  } catch (error) {
    // Extract user-friendly error message from Svix response
    const svixError = error as {
      code?: number
      body?: { detail?: Array<{ msg?: string; loc?: string[] }> }
    }
    if (svixError.code === 422 && svixError.body?.detail?.length) {
      const messages = svixError.body.detail
        .map((d) => d.msg)
        .filter(Boolean)
        .join('; ')
      // biome-ignore lint/plugin: Domain error for boundary contexts to catch and handle
      throw new Error(messages || 'Invalid webhook configuration')
    }
    // biome-ignore lint/plugin: Re-throw unexpected errors after handling known error types
    throw error
  }
}

/**
 * Create a Svix endpoint for the given webhook and organization.
 *
 * Ensures the corresponding Svix application exists for the webhook's livemode, then creates and returns an endpoint configured with the webhook's URL and filter types.
 *
 * @param params.organization - The organization record used to derive the Svix application ID
 * @param params.webhook - The webhook record whose URL, livemode, and filterTypes are used to create the endpoint
 * @returns The created Svix endpoint object
 * @throws If no application ID can be derived for the organization and webhook livemode
 */
export const createSvixEndpoint = svixTraced(
  'endpoint.create',
  (params: CreateSvixEndpointParams) => ({
    'svix.app_id': getSvixApplicationId({
      organization: params.organization,
      livemode: params.webhook.livemode,
      pricingModelId: params.webhook.pricingModelId,
    }),
  }),
  createSvixEndpointCore
)

interface UpdateSvixEndpointParams {
  webhook: Webhook.Record
  organization: Organization.Record
}

/**
 * Core updateSvixEndpoint logic without tracing.
 *
 * When the webhook has a `pricingModelId`, uses PM-scoped Svix application.
 * Otherwise falls back to legacy org+livemode application format.
 */
const updateSvixEndpointCore = async (
  params: UpdateSvixEndpointParams
) => {
  const { webhook, organization } = params
  const endpointId = getSvixEndpointId({
    organization,
    webhook,
    livemode: webhook.livemode,
  })
  const application = await findOrCreateSvixApplication({
    organization,
    livemode: webhook.livemode,
    pricingModelId: webhook.pricingModelId,
  })
  if (!application) {
    // biome-ignore lint/plugin: Domain error for boundary contexts to catch and handle
    throw new Error('No application found')
  }
  const endpoint = await svix().endpoint.patch(
    application.id,
    endpointId,
    {
      url: webhook.url,
      filterTypes: webhook.filterTypes,
      disabled: !webhook.active,
    }
  )
  return endpoint
}

/**
 * Update the Svix endpoint for a webhook using the organization's Svix application.
 *
 * @param params.webhook - Webhook record whose `url`, `filterTypes`, `active`, and `livemode` are applied to the endpoint
 * @param params.organization - Organization record used to derive or create the Svix application
 * @returns The updated Svix endpoint object
 * @throws Error if the corresponding Svix application cannot be found or created
 */
export const updateSvixEndpoint = svixTraced(
  'endpoint.update',
  (params: UpdateSvixEndpointParams) => ({
    'svix.app_id': getSvixApplicationId({
      organization: params.organization,
      livemode: params.webhook.livemode,
      pricingModelId: params.webhook.pricingModelId,
    }),
    'svix.endpoint_id': getSvixEndpointId({
      organization: params.organization,
      webhook: params.webhook,
      livemode: params.webhook.livemode,
    }),
  }),
  updateSvixEndpointCore
)

interface SendSvixEventParams {
  event: Event.Record
  organization: Organization.Record
}

/**
 * Core sendSvixEvent logic with legacy-first routing.
 *
 * Event routing follows a backward-compatible approach:
 * 1. First, check if a legacy org+livemode Svix app exists and send there
 *    to maintain existing end-user behavior
 * 2. If no legacy app exists, check for a PM-scoped app (when event has pricingModelId)
 * 3. If neither app exists, silently no-op (org has no webhooks configured)
 *
 * When hard PM isolation is enforced in the future, the legacy app check
 * will be removed and only PM-scoped apps will be used.
 */
const sendSvixEventCore = async (params: SendSvixEventParams) => {
  const { event, organization } = params

  // 1. Check for legacy org+livemode app first (backward compatibility)
  const legacyAppId = getSvixApplicationId({
    organization,
    livemode: event.livemode,
    // No pricingModelId - legacy format
  })

  const legacyAppExists =
    await checkSvixApplicationExists(legacyAppId)
  if (legacyAppExists) {
    // Send to legacy app to maintain existing end-user behavior
    await svix().message.create(
      legacyAppId,
      {
        eventType: event.type,
        eventId: event.hash,
        payload: {
          ...event.payload,
          pricingModelId: event.pricingModelId,
        },
      },
      {
        idempotencyKey: event.hash,
      }
    )
    return
  }

  // 2. Check for PM-scoped app (only if event has pricingModelId)
  if (event.pricingModelId) {
    const pmAppId = getSvixApplicationId({
      organization,
      livemode: event.livemode,
      pricingModelId: event.pricingModelId,
    })

    const pmAppExists = await checkSvixApplicationExists(pmAppId)
    if (pmAppExists) {
      await svix().message.create(
        pmAppId,
        {
          eventType: event.type,
          eventId: event.hash,
          payload: {
            ...event.payload,
            pricingModelId: event.pricingModelId,
          },
        },
        {
          idempotencyKey: event.hash,
        }
      )
      return
    }
  }

  // 3. No app found - no-op, don't throw error
  // This happens when org has no webhooks configured
}

/**
 * Send the provided event to Svix for the given organization.
 *
 * Uses legacy-first routing: first checks for legacy org+livemode app,
 * then PM-scoped app if event has pricingModelId. Silently no-ops if
 * neither app exists (org has no webhooks configured).
 *
 * @param event - The event record to deliver; its `livemode` and `type` determine routing and metadata.
 * @param organization - The organization record used to derive the Svix application identifier.
 */
export const sendSvixEvent = svixTraced(
  'message.create',
  (params: SendSvixEventParams) => {
    const legacyAppId = getSvixApplicationId({
      organization: params.organization,
      livemode: params.event.livemode,
    })
    const pmAppId = params.event.pricingModelId
      ? getSvixApplicationId({
          organization: params.organization,
          livemode: params.event.livemode,
          pricingModelId: params.event.pricingModelId,
        })
      : undefined

    return {
      'svix.legacy_app_id': legacyAppId,
      'svix.pm_app_id': pmAppId,
      'svix.event_type': params.event.type,
    }
  },
  sendSvixEventCore
)

interface GetSvixSigningSecretParams {
  webhook: Webhook.Record
  organization: Organization.Record
}

/**
 * Core getSvixSigningSecret logic without tracing.
 *
 * When the webhook has a `pricingModelId`, uses PM-scoped Svix application.
 * Otherwise falls back to legacy org+livemode application format.
 */
const getSvixSigningSecretCore = async (
  params: GetSvixSigningSecretParams
): Promise<{ key: string }> => {
  const { webhook, organization } = params
  const endpointId = getSvixEndpointId({
    organization,
    webhook,
    livemode: webhook.livemode,
  })
  const applicationId = getSvixApplicationId({
    organization,
    livemode: webhook.livemode,
    pricingModelId: webhook.pricingModelId,
  })
  const secret = await svix().endpoint.getSecret(
    applicationId,
    endpointId
  )
  return secret
}

/**
 * Retrieve the Svix signing secret for a webhook endpoint associated with an organization.
 *
 * @param webhook - The webhook record identifying the endpoint and its livemode
 * @param organization - The organization that owns the endpoint
 * @returns An object containing the endpoint's signing secret in the `key` property
 */
export const getSvixSigningSecret = svixTraced(
  'endpoint.getSecret',
  (params: GetSvixSigningSecretParams) => ({
    'svix.app_id': getSvixApplicationId({
      organization: params.organization,
      livemode: params.webhook.livemode,
      pricingModelId: params.webhook.pricingModelId,
    }),
    'svix.endpoint_id': getSvixEndpointId({
      organization: params.organization,
      webhook: params.webhook,
      livemode: params.webhook.livemode,
    }),
  }),
  getSvixSigningSecretCore
)
