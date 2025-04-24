import { FlowgladServer } from '@flowglad/nextjs/server'
import { stackServerApp } from './stack'

export const flowgladServer = new FlowgladServer({
  getRequestingCustomer: async () => {
    const user = await stackServerApp.getUser()
    if (!user) {
      throw new Error('User not found')
    }
    return {
      email: user.primaryEmail!,
      name: user.displayName!,
      externalId: user.clientReadOnlyMetadata.externalId,
    }
  },
  baseURL: process.env.API_BASE_URL,
})
