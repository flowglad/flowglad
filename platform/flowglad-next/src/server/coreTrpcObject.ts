export const runtime = 'nodejs' // Force Node.js runtime

import { initTRPC, TRPCError } from '@trpc/server'
import { OpenApiMeta } from 'trpc-to-openapi'
import superjson from 'superjson'
import { extractErrorDetails } from './trpcErrorHandler'

export const t = initTRPC.meta<OpenApiMeta>().create({
  transformer: superjson,
  jsonl: {
    pingMs: 1000,
  },
  errorFormatter({ shape, error }) {
    // Extract better error details from our enhanced errors
    const errorDetails = extractErrorDetails(error)

    return {
      ...shape,
      data: {
        ...shape.data,
        // Include our enhanced error information
        userMessage: errorDetails.userMessage,
        developerMessage: errorDetails.developerMessage,
        context: errorDetails.context,
        // Keep the original for backward compatibility if it exists
        ...(shape.data && 'zodError' in shape.data
          ? { zodError: (shape.data as any).zodError }
          : {}),
      },
    }
  },
})

export type FlowgladTRPC = typeof t
