// /api/flowglad/[...path]/route.ts
import { nextRouteHandler } from '@flowglad/nextjs/server'
import { flowglad } from '@/lib/flowglad'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async (req) => {
    const session = await auth.api.getSession({
      headers: await headers(),
    })
    if (!session?.user) {
      throw new Error('User not authenticated')
    }
    return session.user.id
  },
})
