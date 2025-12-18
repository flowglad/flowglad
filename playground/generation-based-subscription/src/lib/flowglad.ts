import { FlowgladServer } from '@flowglad/nextjs/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

// Use betterAuth adapter for FlowgladServer
export const flowglad = (customerExternalId: string) => {
  console.log('flowglad.customerExternalId', customerExternalId)
  return new FlowgladServer({
    customerExternalId,
    baseURL: 'http://localhost:3000',
    getCustomerDetails: async () => {
      const session = await auth.api.getSession({
        headers: await headers(),
      })
      if (!session?.user) {
        throw new Error('User not authenticated')
      }
      return {
        email: session.user.email,
        name: session.user.name,
      }
    },
  })
}
