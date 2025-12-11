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
    const userId = session?.user?.id
    if (!userId) {
      throw new Error('User not found')
    }
    return userId
  },
})
