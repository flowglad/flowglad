import { FlowgladServer } from '@flowglad/nextjs/server'
import { createClient } from '@/utils/supabase/server'

export const flowglad = (customerExternalId: string) => {
  return new FlowgladServer({
    customerExternalId,
    getCustomerDetails: async (externalId) => {
      // const supabase = await createClient()
      // const {
      //   data: { user },
      // } = await supabase.auth.getUser()
      return {
        email: 'hello-react-native@gmail.com',
        name: 'Agree Ahmed',
        externalId,
      }
    },
    baseURL: 'http://localhost:3000',
  })
}
