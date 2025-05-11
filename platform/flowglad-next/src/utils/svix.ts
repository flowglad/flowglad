import { Svix } from 'svix'
import core from './core'
import { Organization } from '@/db/schema/organizations'
import { Event } from '@/db/schema/events'
import { generateHmac } from './backendCore'
import { Webhook } from '@/db/schema/webhooks'

function svix() {
  return new Svix(core.envVariable('SVIX_SECRET_KEY'))
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

export async function createSvixApplication(params: {
  organization: Organization.Record
  livemode: boolean
}) {
  const { organization, livemode } = params
  const modeSlug = livemode ? 'live' : 'test'
  const app = await svix().application.create({
    name: `${organization.name} - (${organization.id} - ${modeSlug})`,
    uid: getSvixApplicationId({ organization, livemode }),
  })
  return app
}

export async function createSvixEndpoint(params: {
  applicationId: string
  url: string
}) {
  const { applicationId, url } = params
  const endpoint = await svix().endpoint.create(applicationId, {
    url,
  })
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
