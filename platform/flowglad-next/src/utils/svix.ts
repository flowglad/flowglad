import { Svix } from 'svix'
import core from './core'
import { Organization } from '@/db/schema/organizations'
import { Event } from '@/db/schema/events'

const svix = () => {
  return new Svix(core.envVariable('SVIX_SECRET_KEY'))
}

export function getSvixApplicationId(params: {
  organization: Organization.Record
  livemode: boolean
}) {
  const { organization, livemode } = params
  return `${organization.id}_${livemode ? 'live' : 'test'}`
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
  const applicationId = event.livemode
    ? organization.svixLivemodeApplicationId
    : organization.svixTestmodeApplicationId
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
