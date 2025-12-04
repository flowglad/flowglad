import { FlowgladServer } from '@flowglad/express'
import type { Request } from 'express'

export const flowgladServer = (req: Request) => {
  const query = req.query
  return new FlowgladServer({
    baseURL: 'http://localhost:3000',
    getRequestingCustomer: async () => {
      return {
        externalId: query.externalId as string,
        email: query.email as string,
        name: query.name as string,
      }
    },
  })
}
