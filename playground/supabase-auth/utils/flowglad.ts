import { FlowgladServer } from '@flowglad/nextjs/server';
import { createClient } from '@/utils/supabase/server';

export const flowgladServer = new FlowgladServer({
  supabaseAuth: {
    client: createClient
  },
  // getRequestingCustomer: async () => {
  //   return {
  //     email: 'test_lklkajsdlfkjasdfjalsfdjasdf@test.com',
  //     name: 'Test User',
  //     externalId: '___IPasdkfasdfasdfasdfjalks123'
  //   };
  // },
  baseURL: 'http://localhost:3000'
});
