import { FlowgladServer } from '@flowglad/nextjs/server'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    // rm for production
    baseURL: 'http://localhost:3000',
    customerExternalId,
    getCustomerDetails: async () => {
      const session = await auth.api.getSession({
        headers: await headers(),
      })
      if (!session?.user) {
        throw new Error('User not authenticated')
      }
      return {
        email: session.user.email || '',
        name: session.user.name || '',
      }
    },
  })
}
