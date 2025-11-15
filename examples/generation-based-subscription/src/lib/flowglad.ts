import { FlowgladServer } from '@flowglad/nextjs/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

// Use betterAuth adapter for FlowgladServer
export const flowgladServer = new FlowgladServer({
  betterAuth: {
    getSession: async () => auth.api.getSession({ headers: await headers() }),
  },
});
