// /api/flowglad/[...path]/route.ts
import { createAppRouterRouteHandler } from '@flowglad/nextjs/server';
import { flowgladServer } from '@/lib/flowglad';

const routeHandler = createAppRouterRouteHandler(flowgladServer);

export { routeHandler as GET, routeHandler as POST };
