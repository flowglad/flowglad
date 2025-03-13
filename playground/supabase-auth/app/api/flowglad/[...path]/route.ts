'use server';
import { createNextRouteHandler } from '@flowglad/nextjs/server';
import { flowgladServer } from '@/utils/flowglad';

const routeHandler = createNextRouteHandler(flowgladServer);

export const GET = routeHandler;

export const POST = routeHandler;
