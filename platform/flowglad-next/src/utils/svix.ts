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

import { type Span, SpanKind } from '@opentelemetry/api'
import { type ApplicationOut, Svix } from 'svix'
import { Application } from 'svix/dist/api/application'
import { ApiException } from 'svix/dist/util'
import type { Event } from '@/db/schema/events'
import type { Organization } from '@/db/schema/organizations'
import type { Webhook } from '@/db/schema/webhooks'
import { withSpan } from '@/utils/tracing'
import { generateHmac } from './backendCore'
import core from './core'

const withSvixSpan = async <T>(
  operation: string,
  attributes: Record<string, string | number | boolean | undefined>,
  fn: (span: Span) => Promise<T>
): Promise<T> => {
  return withSpan(
    {
      spanName: `svix.${operation}`,
      tracerName: 'svix',
      kind: SpanKind.CLIENT,
      attributes: {
        'svix.operation': operation,
        ...attributes,
      },
    },
    fn
  )
}

/**
 * Create a Svix client configured from the `SVIX_API_KEY` environment variable.
 *
 * @returns A Svix client instance initialized with the value of `SVIX_API_KEY`.
 */
export function svix() {
  return new Svix(core.envVariable('SVIX_API_KEY'))
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
    key: core.envVariable('HMAC_KEY_SVIX'),
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
 * Ensures a Svix application exists for the given organization and livemode.
 *
 * Attempts to fetch a Svix application by its deterministic ID and creates a new application with a name derived from the organization if no existing application is found. The OpenTelemetry span used for the operation is annotated with the attribute `svix.created` set to `true` when a new application is created and `false` when an existing application is returned.
 *
 * @param organization - Organization record used to compute the Svix application ID and display name
 * @param livemode - When `true`, use the live-mode application ID; when `false`, use the test-mode application ID
 * @returns The existing or newly created Svix application
 */
export async function findOrCreateSvixApplication(params: {
  organization: Organization.Record
  livemode: boolean
}) {
  const { organization, livemode } = params
  const modeSlug = livemode ? 'live' : 'test'
  const applicationId = getSvixApplicationId({
    organization,
    livemode,
  })
  return withSvixSpan(
    'application.findOrCreate',
    {
      'svix.org_id': organization.id,
    },
    async (span) => {
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
        span.setAttributes({ 'svix.created': false })
        return app
      }
      span.setAttributes({ 'svix.created': true })
      return await svix().application.create({
        name: `${organization.name} - (${organization.id} - ${modeSlug})`,
        uid: applicationId,
      })
    }
  )
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
export async function createSvixEndpoint(params: {
  organization: Organization.Record
  webhook: Webhook.Record
}) {
  const { organization, webhook } = params
  const applicationId = getSvixApplicationId({
    organization,
    livemode: webhook.livemode,
  })
  if (!applicationId) {
    throw new Error('No application ID found')
  }
  return withSvixSpan(
    'endpoint.create',
    {
      'svix.app_id': applicationId,
    },
    async () => {
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
  )
}

/**
 * Update the Svix endpoint for a webhook using the organization's Svix application.
 *
 * @param params.webhook - Webhook record whose `url`, `filterTypes`, `active`, and `livemode` are applied to the endpoint
 * @param params.organization - Organization record used to derive or create the Svix application
 * @returns The updated Svix endpoint object
 * @throws Error if the corresponding Svix application cannot be found or created
 */
export async function updateSvixEndpoint(params: {
  webhook: Webhook.Record
  organization: Organization.Record
}) {
  const { webhook, organization } = params
  const applicationId = getSvixApplicationId({
    organization,
    livemode: webhook.livemode,
  })
  const endpointId = getSvixEndpointId({
    organization,
    webhook,
    livemode: webhook.livemode,
  })
  return withSvixSpan(
    'endpoint.update',
    {
      'svix.app_id': applicationId,
      'svix.endpoint_id': endpointId,
    },
    async () => {
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
export async function sendSvixEvent(params: {
  event: Event.Record
  organization: Organization.Record
}) {
  const { event, organization } = params
  const applicationId = getSvixApplicationId({
    organization,
    livemode: event.livemode,
  })
  if (!applicationId) {
    throw new Error('No application ID found')
  }
  return withSvixSpan(
    'message.create',
    {
      'svix.app_id': applicationId,
      'svix.event_type': event.type,
    },
    async () => {
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
  )
}

/**
 * Retrieve the Svix signing secret for a webhook endpoint associated with an organization.
 *
 * @param webhook - The webhook record identifying the endpoint and its livemode
 * @param organization - The organization that owns the endpoint
 * @returns An object containing the endpoint's signing secret in the `key` property
 */
export async function getSvixSigningSecret(params: {
  webhook: Webhook.Record
  organization: Organization.Record
}): Promise<{ key: string }> {
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
  return withSvixSpan(
    'endpoint.getSecret',
    {
      'svix.app_id': applicationId,
      'svix.endpoint_id': endpointId,
    },
    async () => {
      const secret = await svix().endpoint.getSecret(
        applicationId,
        endpointId
      )
      return secret
    }
  )
}
