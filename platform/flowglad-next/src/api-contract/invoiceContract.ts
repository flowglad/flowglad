import type { Flowglad as FlowgladNode } from '@flowglad/node'
import type { StandardLogger } from '@/types'
import { flowgladNode } from './nodeClient'

const getInvoiceResource = (id: string, client: FlowgladNode) => {
  return client.invoices.retrieve(id)
}

const getInvoiceListResource = (client: FlowgladNode) => {
  return client.invoices.list()
}

export const verifyInvoiceContract = async (logger: StandardLogger) => {
  const client = flowgladNode()

  const list = await getInvoiceListResource(client)
  logger.info(`Got invoice list: ${list.data.length}`)

  if (list.data.length > 0) {
    const retrieved = await getInvoiceResource(list.data[0].id, client)
    logger.info(`Got invoice: ${retrieved.invoice.id}`)
    return { invoice: retrieved.invoice, list }
  }

  logger.warn('No invoices found, skipping retrieve')
  return { invoice: null, list }
}
