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

import { type ApplicationOut, Svix } from 'svix'
import { ApiException } from 'svix/dist/util'
import type { Event } from '@/db/schema/events'
import type { Organization } from '@/db/schema/organizations'
import type { Webhook } from '@/db/schema/webhooks'
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
 * @returns A Svix client instance initialized with the value of `SVIX_API_KEY`.
 */
export function svix() {
  return new Svix(
    core.IS_TEST
      ? 'test_svix_api_key'
      : core.envVariable('SVIX_API_KEY')
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

export function getSvixApplicationId(params: {
  organization: Organization.Record
  livemode: boolean
}) {
  const { organization, livemode } = params
  return generateSvixId({
    prefix: 'app',
    id: organization.id,
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
 * Core findOrCreateSvixApplication logic with checkpoint callback for tracing.
 */
const findOrCreateSvixApplicationCore = async (
  checkpoint: Checkpoint,
  params: {
    organization: Organization.Record
    livemode: boolean
  }
): Promise<ApplicationOut> => {
  const { organization, livemode } = params
  const modeSlug = livemode ? 'live' : 'test'
  const applicationId = getSvixApplicationId({
    organization,
    livemode,
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
 * @param organization - Organization record used to compute the Svix application ID and display name
 * @param livemode - When `true`, use the live-mode application ID; when `false`, use the test-mode application ID
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
 */
const createSvixEndpointCore = async (
  params: CreateSvixEndpointParams
) => {
  const { organization, webhook } = params
  const applicationId = getSvixApplicationId({
    organization,
    livemode: webhook.livemode,
  })
  if (!applicationId) {
    throw new Error('No application ID found')
  }
  await findOrCreateSvixApplication({
    organization,
    livemode: webhook.livemode,
  })
  const endpointId = getSvixEndpointId({
    organization,
    webhook,
    livemode: webhook.livemode,
  })
  const endpoint = await svix().endpoint.create(applicationId, {
    uid: endpointId,
    url: webhook.url,
    filterTypes: webhook.filterTypes,
  })
  return endpoint
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
  })
  if (!application) {
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
 * Core sendSvixEvent logic without tracing.
 */
const sendSvixEventCore = async (params: SendSvixEventParams) => {
  const { event, organization } = params
  const applicationId = getSvixApplicationId({
    organization,
    livemode: event.livemode,
  })
  if (!applicationId) {
    throw new Error('No application ID found')
  }
  await svix().message.create(
    applicationId,
    {
      eventType: event.type,
      eventId: event.hash,
      payload: event.payload,
    },
    {
      idempotencyKey: event.hash,
    }
  )
}

/**
 * Send the provided event to Svix for the given organization.
 *
 * @param event - The event record to deliver; its `livemode` and `type` determine routing and metadata.
 * @param organization - The organization record used to derive the Svix application identifier.
 *
 * @throws If no Svix application ID can be derived for the organization and event livemode.
 */
export const sendSvixEvent = svixTraced(
  'message.create',
  (params: SendSvixEventParams) => ({
    'svix.app_id': getSvixApplicationId({
      organization: params.organization,
      livemode: params.event.livemode,
    }),
    'svix.event_type': params.event.type,
  }),
  sendSvixEventCore
)

interface GetSvixSigningSecretParams {
  webhook: Webhook.Record
  organization: Organization.Record
}

/**
 * Core getSvixSigningSecret logic without tracing.
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
    }),
    'svix.endpoint_id': getSvixEndpointId({
      organization: params.organization,
      webhook: params.webhook,
      livemode: params.webhook.livemode,
    }),
  }),
  getSvixSigningSecretCore
)
