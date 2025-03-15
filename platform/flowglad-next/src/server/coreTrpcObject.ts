export const runtime = 'nodejs' // Force Node.js runtime

import { initTRPC, TRPCError } from '@trpc/server'
import { OpenApiMeta } from 'trpc-swagger'
import superjson from 'superjson'

export const t = initTRPC.meta<OpenApiMeta>().create({
  transformer: superjson,
})

export type FlowgladTRPC = typeof t
