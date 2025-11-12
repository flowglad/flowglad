import { FlowgladServer } from '@flowglad/nextjs/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

//Flowglad doesn't currently support BetterAuth, so we need to handle the session ourselves.
export const flowgladServer = new FlowgladServer({
  getRequestingCustomer: async () => {
    // If request is provided (from API route), use it; otherwise will need headers
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) {
      throw new Error('Unauthorized: No session found');
    }
    return {
      externalId: session?.user?.id,
      name: session?.user?.name ?? '',
      email: session?.user?.email ?? '',
    };
  },
});
