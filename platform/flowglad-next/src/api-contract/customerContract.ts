import { StandardLogger } from '@/types'
import { flowgladNode } from './nodeClient'
import { Flowglad as FlowgladNode } from '@flowglad/node'

const getCustomerResource = (
  externalId: string,
  client: FlowgladNode
) => {
  return client.customers.retrieve(externalId)
}

const getCustomerBillingResource = (
  externalId: string,
  client: FlowgladNode
) => {
  return client.customers.retrieveBilling(externalId)
}

const createCustomerResource = (
  customer: FlowgladNode.Customers.CustomerCreateParams,
  client: FlowgladNode
) => {
  return client.customers.create(customer)
}

const updateCustomerResource = (
  externalId: string,
  customer: FlowgladNode.Customers.CustomerUpdateParams,
  client: FlowgladNode
) => {
  return client.customers.update(externalId, customer)
}

const getCustomerListResource = (client: FlowgladNode) => {
  return client.customers.list()
}

export const verifyCustomerContract = async (
  logger: StandardLogger
) => {
  const client = flowgladNode()
  const externalId = 'test-user-id-' + Date.now()
  const createdCustomer = await createCustomerResource(
    {
      customer: {
        email: 'test@example.com',
        name: 'Test User',
        externalId,
      },
    },
    client
  )
  logger.info(`Created customer: ${createdCustomer.data.customer.id}`)
  const getCustomerResult = await getCustomerResource(
    externalId,
    client
  )
  logger.info(`Got customer: ${getCustomerResult.customer.id}`)
  const billingResult = await getCustomerBillingResource(
    externalId,
    client
  )
  logger.info(`Got billing: ${billingResult.customer.id}`)
  const updatedCustomer = await updateCustomerResource(
    externalId,
    {
      customer: {
        id: createdCustomer.data.customer.id,
        email: 'test333@example.com',
        name: 'Test User',
      },
    },
    client
  )
  logger.info(`Updated customer: ${updatedCustomer.customer.id}`)
  const customerListResult = await getCustomerListResource(client)
  logger.info(`Got customer list: ${customerListResult.data.length}`)
  return {
    customer: getCustomerResult,
    billing: billingResult,
    createdCustomer,
    customerListResult,
  }
}
