import { StandardLogger } from '@/types'
import { flowgladNode } from './nodeClient'
import { Flowglad as FlowgladNode } from '@flowglad/node'

const getCheckoutSessionResource = (
  id: string,
  client: FlowgladNode
) => {
  return client.checkoutSessions.retrieve(id)
}

const createCheckoutSessionesource = (
  checkoutSession: FlowgladNode.CheckoutSessions.CheckoutSessionCreateParams,
  client: FlowgladNode
) => {
  return client.checkoutSessions.create(checkoutSession)
}

// const updateCheckoutSessionesource = (
//   id: string,
//   checkoutSession: FlowgladNode.CheckoutSessions.CheckoutSessionUpdateParams,
//   client: FlowgladNode
// ) => {
//   return client.checkoutSessions.update(id, checkoutSession)
// }

const getCheckoutSessionListResource = (client: FlowgladNode) => {
  return client.checkoutSessions.list()
}

export const verifyCheckoutSessionContract = async (
  params: {
    customer: FlowgladNode.Customers.CustomerRetrieveResponse['customer']
  },
  logger: StandardLogger
) => {
  const client = flowgladNode()
  const prices = await client.prices.list()
  logger.info(`Prices: ${prices.data.length}`)
  const createdCheckoutSession = await createCheckoutSessionesource(
    {
      checkoutSession: {
        type: 'product',
        priceId: prices.data[0].id,
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
  const getCheckoutSessionesult = await getCheckoutSessionResource(
    createdCheckoutSession.checkoutSession.id,
    client
  )
  logger.info(
    `Got checkout session: ${getCheckoutSessionesult.checkoutSession.id}`
  )
  return {
    checkoutSession: getCheckoutSessionesult,
    createdCheckoutSession,
  }
}
