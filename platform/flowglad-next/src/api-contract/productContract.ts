import type { Flowglad as FlowgladNode } from '@flowglad/node'
import type { StandardLogger } from '@/types'
import core from '@/utils/core'
import { flowgladNode } from './nodeClient'

const getDefaultPricingModel = (client: FlowgladNode) => {
  return client.pricingModels.retrieveDefault()
}

const createProductResource = (
  params: FlowgladNode.Products.ProductCreateParams,
  client: FlowgladNode
) => {
  return client.products.create(params)
}

const getProductResource = (id: string, client: FlowgladNode) => {
  return client.products.retrieve(id)
}

const updateProductResource = (
  id: string,
  params: FlowgladNode.Products.ProductUpdateParams,
  client: FlowgladNode
) => {
  return client.products.update(id, params)
}

const getProductListResource = (client: FlowgladNode) => {
  return client.products.list()
}

export const verifyProductContract = async (logger: StandardLogger) => {
  const client = flowgladNode()
  const testId = 'test-product-' + core.nanoid()
  logger.info(`Product test ID: ${testId}`)

  // Get the default pricing model to use for product creation
  const defaultPricingModel = await getDefaultPricingModel(client)
  logger.info(
    `Using default pricing model: ${defaultPricingModel.pricingModel.id}`
  )

  const createdProduct = await createProductResource(
    {
      product: {
        name: testId,
        active: true,
        pricingModelId: defaultPricingModel.pricingModel.id,
      },
      price: {
        type: 'subscription',
        unitPrice: 1000, // $10.00
        intervalCount: 1,
        intervalUnit: 'month',
        isDefault: true,
      },
    },
    client
  )
  logger.info(`Created product: ${createdProduct.product.id}`)

  const getProductResult = await getProductResource(
    createdProduct.product.id,
    client
  )
  logger.info(`Got product: ${getProductResult.id}`)

  const updatedProduct = await updateProductResource(
    createdProduct.product.id,
    {
      product: {
        id: createdProduct.product.id,
        name: testId + '-updated',
        active: true,
      },
    },
    client
  )
  logger.info(`Updated product: ${updatedProduct.product.id}`)

  const productListResult = await getProductListResource(client)
  logger.info(`Got product list: ${productListResult.data.length}`)

  return {
    product: getProductResult,
    createdProduct,
    updatedProduct,
    productListResult,
  }
}
