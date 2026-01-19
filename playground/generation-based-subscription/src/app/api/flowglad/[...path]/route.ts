// /api/flowglad/[...path]/route.ts
import { nextRouteHandler } from '@flowglad/nextjs/server'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { flowglad } from '@/lib/flowglad'

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async () => {
    // Use the Flowglad plugin's getExternalId endpoint to get the correct external ID
    // This handles the customerType configuration (user vs organization)
    const { externalId } = await auth.api.getExternalId({
      headers: await headers(),
    })

    if (!externalId) {
      throw new Error('Unable to determine customer external ID')
    }

    return externalId
  },
})
