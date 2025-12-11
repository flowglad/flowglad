import type { Flowglad as FlowgladNode } from '@flowglad/node'
import type { StandardLogger } from '@/types'
import { flowgladNode } from './nodeClient'

const getCheckoutSessionResource = (
  id: string,
  client: FlowgladNode
) => {
  return client.checkoutSessions.retrieve(id)
}

const createCheckoutSessionResource = (
  checkoutSession: FlowgladNode.CheckoutSessions.CheckoutSessionCreateParams,
  client: FlowgladNode
) => {
  return client.checkoutSessions.create(checkoutSession)
}

// const updateCheckoutSessionResource = (
//   id: string,
//   checkoutSession: FlowgladNode.CheckoutSessions.CheckoutSessionUpdateParams,
//   client: FlowgladNode
// ) => {
//   return client.checkoutSessions.update(id, checkoutSession)
// }

// const getCheckoutSessionListResource = (client: FlowgladNode) => {
//   return client.checkoutSessions.list()
// }

export const verifyCheckoutSessionContract = async (
  params: {
    customer: FlowgladNode.Customers.CustomerRetrieveResponse['customer']
  },
  logger: StandardLogger
) => {
  const client = flowgladNode()

  // Fetch products and prices separately
  const products = await client.products.list()
  const prices = await client.prices.list()
  logger.info(
    `Products: ${products.data.length}, Prices: ${prices.data.length}`
  )

  // Create a set of default product IDs
  const defaultProductIds = new Set(
    products.data.filter((p) => p.default).map((p) => p.id)
  )

  // Find a price that doesn't belong to a default product
  const nonDefaultPrice = prices.data.find(
    (price) =>
      price.productId && !defaultProductIds.has(price.productId)
  )

  if (!nonDefaultPrice) {
    throw new Error(
      'No non-default product prices found. At least one price for a non-default product is required to create a checkout session.'
    )
  }

  logger.info(`Using price: ${nonDefaultPrice.id}`)

  const createdCheckoutSession = await createCheckoutSessionResource(
    {
      checkoutSession: {
        type: 'product',
        priceId: nonDefaultPrice.id,
        quantity: 1,
        customerExternalId: params.customer.externalId,
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        outputMetadata: {
          test: 'test',
        },
        outputName: 'Test User',
      },
    },
    client
  )
  logger.info(
    `Created checkout session: ${createdCheckoutSession.checkoutSession.id}`
  )
  const getCheckoutSessionResult = await getCheckoutSessionResource(
    createdCheckoutSession.checkoutSession.id,
    client
  )
  logger.info(
    `Got checkout session: ${getCheckoutSessionResult.checkoutSession.id}`
  )
  return {
    checkoutSession: getCheckoutSessionResult,
    createdCheckoutSession,
  }
}
