import { expressRouter } from '@flowglad/server/express'
import type { Request } from 'express'
import { flowglad } from '../utils/flowglad'

export const flowgladRouter = expressRouter({
  getCustomerExternalId: async (req: Request) => {
    // Extract from req.query, req.user, etc.
    return req.query.externalId as string
  },
  flowglad,
})
