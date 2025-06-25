import {
  FlowgladServer,
  mcpHandlerWithFlowglad,
  toolWithFeatureAccessCheck
} from '@flowglad/nextjs/server';
import { z } from 'zod';

const handler = mcpHandlerWithFlowglad(
  async (server, flowglad) => {
    server.tool(
      'echo',
      'description',
      {
        message: z.string()
      },
      toolWithFeatureAccessCheck(
        async ({ message }) => ({
          content: [{ type: 'text', text: `Tool echo: ${message}` }]
        }),
        {
          featureSlug: 'echo',
          flowgladServer: flowglad,
          upgradePriceSlug: 'pro_plan',
          successUrl: 'http://localhost:3001/purchase/post-payment',
          cancelUrl: 'http://localhost:3001/purchase/post-payment'
        }
      )
    );
  },
  async (request) => {
    return new FlowgladServer({
      baseURL: 'http://localhost:3000',
      getRequestingCustomer: async () => {
        return {
          externalId: '123_oklkjlk12j34',
          email: 'test@test.com',
          name: 'Test User'
        };
      }
    });
  }
);

export { handler as GET, handler as POST, handler as DELETE };
