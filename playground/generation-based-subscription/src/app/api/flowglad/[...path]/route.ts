// /api/flowglad/[...path]/route.ts
import { createAppRouterRouteHandler } from '@flowglad/nextjs/server'
import { flowgladServer } from '@/lib/flowglad'

const createRouteHandler = createAppRouterRouteHandler(flowgladServer)

export { createRouteHandler as GET, createRouteHandler as POST }
