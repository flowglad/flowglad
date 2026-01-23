import type { Flowglad as FlowgladNode } from '@flowglad/node'
import type { StandardLogger } from '@/types'
import core from '@/utils/core'
import { flowgladNode } from './nodeClient'

const getResourceResource = (id: string, client: FlowgladNode) => {
  return client.resources.retrieve(id)
}

const createResourceResource = (
  params: FlowgladNode.Resources.ResourceCreateParams,
  client: FlowgladNode
) => {
  return client.resources.create(params)
}

const updateResourceResource = (
  id: string,
  params: FlowgladNode.Resources.ResourceUpdateParams,
  client: FlowgladNode
) => {
  return client.resources.update(id, params)
}

const getResourceListResource = (
  params: FlowgladNode.Resources.ResourceListParams,
  client: FlowgladNode
) => {
  return client.resources.list(params)
}

export const verifyResourceContract = async (
  params: {
    pricingModel: FlowgladNode.PricingModels.PricingModelClientSelectSchema
  },
  logger: StandardLogger
) => {
  const client = flowgladNode()
  const testId = 'test-resource-' + core.nanoid()

  const createdResource = await createResourceResource(
    {
      resource: {
        name: testId,
        pricingModelId: params.pricingModel.id,
        slug: testId,
      },
    },
    client
  )
  logger.info(`Created resource: ${createdResource.resource.id}`)

  const getResourceResult = await getResourceResource(
    createdResource.resource.id,
    client
  )
  logger.info(`Got resource: ${getResourceResult.resource.id}`)

  const updatedResource = await updateResourceResource(
    createdResource.resource.id,
    {
      resource: {
        id: createdResource.resource.id,
        name: testId + '-updated',
      },
    },
    client
  )
  logger.info(`Updated resource: ${updatedResource.resource.id}`)

  const resourceListResult = await getResourceListResource(
    {
      pricingModelId: params.pricingModel.id,
    },
    client
  )
  logger.info(
    `Got resource list: ${resourceListResult.resources.length}`
  )

  return {
    resource: getResourceResult.resource,
    createdResource,
    updatedResource,
    resourceListResult,
  }
}
