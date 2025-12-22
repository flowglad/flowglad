import { expressRouter } from '@flowglad/server/express'
import type { Request } from 'express'
import { flowglad } from '../utils/flowglad'

export const flowgladRouter = expressRouter({
  getCustomerExternalId: async (req: Request) => {
    // Extract from req.query, req.user, etc.
    const externalId = req.query.externalId
    if (typeof externalId !== 'string') {
      throw new Error('externalId query parameter is required')
    }
    return externalId
  },
  flowglad,
})
