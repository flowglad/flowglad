import { FlowgladServer } from '@flowglad/nextjs/server';
import { createClient } from '@/utils/supabase/server';

export const flowgladServer = new FlowgladServer({
  // supabaseAuth: {
  //   client: createClient
  // },
  getRequestingCustomer: async () => {
    return {
      email: 'test_lkjalsfdjasdf@test.com',
      name: 'Test User',
      externalId: '___IPasdkfjalks123'
    };
  }
  // baseURL: 'http://localhost:3000'
});
