import type { Flowglad as FlowgladNode } from '@flowglad/node'
import type { StandardLogger } from '@/types'
import core from '@/utils/core'
import { flowgladNode } from './nodeClient'

const createDiscountResource = (
  discount: FlowgladNode.Discounts.DiscountCreateParams,
  client: FlowgladNode
) => {
  return client.discounts.create(discount)
}

const getDiscountResource = (id: string, client: FlowgladNode) => {
  return client.discounts.retrieve(id)
}

const updateDiscountResource = (
  id: string,
  discount: FlowgladNode.Discounts.DiscountUpdateParams,
  client: FlowgladNode
) => {
  return client.discounts.update(id, discount)
}

const getDiscountListResource = (client: FlowgladNode) => {
  return client.discounts.list()
}

export const verifyDiscountContract = async (
  logger: StandardLogger
) => {
  const client = flowgladNode()
  // Discount code must be 3-20 characters
  const testCode = core.nanoid().slice(0, 10)
  const testName = 'test-discount-' + core.nanoid()

  const createdDiscount = await createDiscountResource(
    {
      discount: {
        name: testName,
        code: testCode,
        amount: 10,
        amountType: 'percent',
        duration: 'once',
      },
    },
    client
  )
  logger.info(`Created discount: ${createdDiscount.discount.id}`)

  const getDiscountResult = await getDiscountResource(
    createdDiscount.discount.id,
    client
  )
  logger.info(`Got discount: ${getDiscountResult.discount.id}`)

  const updatedCode = core.nanoid().slice(0, 10)
  const updatedDiscount = await updateDiscountResource(
    createdDiscount.discount.id,
    {
      discount: {
        id: createdDiscount.discount.id,
        name: testName + '-updated',
        code: updatedCode,
        amount: 15,
        amountType: 'percent',
        duration: 'once',
      },
    },
    client
  )
  logger.info(`Updated discount: ${updatedDiscount.discount.id}`)

  const discountListResult = await getDiscountListResource(client)
  logger.info(`Got discount list: ${discountListResult.data.length}`)

  return {
    discount: getDiscountResult.discount,
    createdDiscount,
    updatedDiscount,
    discountListResult,
  }
}
