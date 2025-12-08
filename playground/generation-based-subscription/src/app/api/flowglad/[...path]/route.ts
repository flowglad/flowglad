// /api/flowglad/[...path]/route.ts
import { createAppRouterRouteHandler } from '@flowglad/nextjs/server'
import { flowgladServer } from '@/lib/flowglad'

export const { GET, POST } =
  createAppRouterRouteHandler(flowgladServer)
