import type { Flowglad as FlowgladNode } from '@flowglad/node'
import type { StandardLogger } from '@/types'
import core from '@/utils/core'
import { flowgladNode } from './nodeClient'

const getUsageMeterResource = (id: string, client: FlowgladNode) => {
  return client.usageMeters.retrieve(id)
}

const createUsageMeterResource = (
  params: FlowgladNode.UsageMeters.UsageMeterCreateParams,
  client: FlowgladNode
) => {
  return client.usageMeters.create(params)
}

const updateUsageMeterResource = (
  id: string,
  params: FlowgladNode.UsageMeters.UsageMeterUpdateParams,
  client: FlowgladNode
) => {
  return client.usageMeters.update(id, params)
}

const getUsageMeterListResource = (client: FlowgladNode) => {
  return client.usageMeters.list()
}

const getDefaultPricingModelResource = (client: FlowgladNode) => {
  return client.pricingModels.retrieveDefault()
}

export const verifyUsageMeterContract = async (
  logger: StandardLogger
) => {
  const client = flowgladNode()
  const testId = 'test-usage-meter-' + core.nanoid()
  logger.info(`Usage Meter test ID: ${testId}`)

  // Get the default pricing model to use for creating usage meters
  const defaultPricingModel =
    await getDefaultPricingModelResource(client)
  logger.info(
    `Got default pricing model: ${defaultPricingModel.pricingModel.id}`
  )

  const createdUsageMeter = await createUsageMeterResource(
    {
      usageMeter: {
        name: testId,
        slug: testId,
        pricingModelId: defaultPricingModel.pricingModel.id,
        aggregationType: 'sum',
      },
    },
    client
  )
  logger.info(
    `Created usage meter: ${createdUsageMeter.usageMeter.id}`
  )

  const getUsageMeterResult = await getUsageMeterResource(
    createdUsageMeter.usageMeter.id,
    client
  )
  logger.info(`Got usage meter: ${getUsageMeterResult.usageMeter.id}`)

  const updatedUsageMeter = await updateUsageMeterResource(
    createdUsageMeter.usageMeter.id,
    {
      usageMeter: {
        id: createdUsageMeter.usageMeter.id,
        name: testId + '-updated',
      },
    },
    client
  )
  logger.info(
    `Updated usage meter: ${updatedUsageMeter.usageMeter.id}`
  )

  const usageMeterListResult = await getUsageMeterListResource(client)
  logger.info(
    `Got usage meter list: ${usageMeterListResult.data.length}`
  )

  return {
    usageMeter: getUsageMeterResult.usageMeter,
    createdUsageMeter,
    updatedUsageMeter,
    usageMeterListResult,
  }
}
