import type { Flowglad as FlowgladNode } from '@flowglad/node'
import type { StandardLogger } from '@/types'
import core from '@/utils/core'
import { flowgladNode } from './nodeClient'

const createPricingModelResource = (
  params: FlowgladNode.PricingModels.PricingModelCreateParams,
  client: FlowgladNode
) => {
  return client.pricingModels.create(params)
}

const getPricingModelResource = (
  id: string,
  client: FlowgladNode
) => {
  return client.pricingModels.retrieve(id)
}

const updatePricingModelResource = (
  id: string,
  params: FlowgladNode.PricingModels.PricingModelUpdateParams,
  client: FlowgladNode
) => {
  return client.pricingModels.update(id, params)
}

const getPricingModelListResource = (client: FlowgladNode) => {
  return client.pricingModels.list()
}

const clonePricingModelResource = (
  id: string,
  params: FlowgladNode.PricingModels.PricingModelCloneParams,
  client: FlowgladNode
) => {
  return client.pricingModels.clone(id, params)
}

export const verifyPricingModelContract = async (
  logger: StandardLogger
) => {
  const client = flowgladNode()
  const testId = 'test-pricing-model-' + core.nanoid()

  const createdPricingModel = await createPricingModelResource(
    {
      pricingModel: {
        name: testId,
      },
    },
    client
  )
  logger.info(
    `Created pricing model: ${createdPricingModel.pricingModel.id}`
  )

  const getPricingModelResult = await getPricingModelResource(
    createdPricingModel.pricingModel.id,
    client
  )
  logger.info(
    `Got pricing model: ${getPricingModelResult.pricingModel.id}`
  )

  const updatedPricingModel = await updatePricingModelResource(
    createdPricingModel.pricingModel.id,
    {
      pricingModel: {
        id: createdPricingModel.pricingModel.id,
        name: testId + '-updated',
      },
    },
    client
  )
  logger.info(
    `Updated pricing model: ${updatedPricingModel.pricingModel.id}`
  )

  const pricingModelListResult =
    await getPricingModelListResource(client)
  logger.info(
    `Got pricing model list: ${pricingModelListResult.data.length}`
  )

  const clonedPricingModel = await clonePricingModelResource(
    createdPricingModel.pricingModel.id,
    {
      name: testId + '-cloned',
    },
    client
  )
  logger.info(
    `Cloned pricing model: ${clonedPricingModel.pricingModel.id}`
  )

  return {
    pricingModel: getPricingModelResult.pricingModel,
    createdPricingModel,
    updatedPricingModel,
    pricingModelListResult,
    clonedPricingModel,
  }
}
