import { ApplicationOut, Svix } from 'svix'
import core from './core'
import { Organization } from '@/db/schema/organizations'
import { Event } from '@/db/schema/events'
import { generateHmac } from './backendCore'
import { Webhook } from '@/db/schema/webhooks'
import { Application } from 'svix/dist/api/application'

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
  let app: ApplicationOut | undefined
  try {
    app = await svix().application.get(applicationId)
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log('error', error)
  }
  if (app) {
    return app
  }
  return await svix().application.create({
    name: `${organization.name} - (${organization.id} - ${modeSlug})`,
    uid: applicationId,
  })
}

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

export async function updateSvixEndpoint(params: {
  webhook: Webhook.Record
  organization: Organization.Record
}) {
  const { webhook, organization } = params
  const application = await findOrCreateSvixApplication({
    organization,
    livemode: webhook.livemode,
  })
  if (!application) {
    throw new Error('No application found')
  }
  const endpointId = getSvixEndpointId({
    organization,
    webhook,
    livemode: webhook.livemode,
  })

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

export async function getSvixSigningSecret(params: {
  webhook: Webhook.Record
  organization: Organization.Record
}) {
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
