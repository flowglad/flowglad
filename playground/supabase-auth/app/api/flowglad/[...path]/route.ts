import { nextRouteHandler } from '@flowglad/nextjs/server'
import { flowglad } from '@/utils/flowglad'
import { createClient } from '@/utils/supabase/server'

export const { GET, POST } = nextRouteHandler({
  flowglad,
  getCustomerExternalId: async (req) => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const userId = user?.id
    if (!userId) {
      throw new Error('User not found')
    }
    return userId
  },
})
