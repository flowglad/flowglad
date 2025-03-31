'use server';
import { createAppRouterRouteHandler } from '@flowglad/nextjs/server';
import { flowgladServer } from '@/utils/flowglad';

const routeHandler = createAppRouterRouteHandler(flowgladServer);

export const GET = routeHandler;

export const POST = routeHandler;
