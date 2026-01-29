'use client'
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import {
  httpBatchLink,
  httpBatchStreamLink,
  splitLink,
} from '@trpc/client'
import type React from 'react'
import { useState } from 'react'
import SuperJSON from 'superjson'
import core from '@/utils/core'
import { trpc } from './client'

export default function Provider({
  children,
}: {
  children: React.ReactNode
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
            staleTime: 1000 * 60 * 5,
            retry: 3,
            retryDelay: 600,
          },
        },
      })
  )
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        /**
         * Route customer billing portal operations to dedicated customer handler.
         * This ensures customerBillingPortal.* ops use createCustomerContext.
         */
        splitLink({
          condition(op) {
            return op.path.startsWith('customerBillingPortal.')
          },
          true: [
            httpBatchLink({
              url: `${core.envVariable('APP_URL')}/api/trpc/customer`,
              transformer: SuperJSON,
            }),
          ],
          false: [
            /**
             * Conditional link to use streaming or batching based on the path
             * .streaming suffix on procedure name indicates a streaming response.
             */
            splitLink({
              // decide which link to use
              condition(op) {
                return op.path.endsWith('.streaming')
              },
              // true branch -> stream responses
              true: [
                httpBatchStreamLink({
                  url: `${core.envVariable('APP_URL')}/api/trpc`,
                  transformer: SuperJSON,
                }),
              ],
              // false branch -> normal batching
              false: [
                httpBatchLink({
                  url: `${core.envVariable('APP_URL')}/api/trpc`,
                  transformer: SuperJSON,
                }),
              ],
            }),
          ],
        }),
      ],
    })
  )
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  )
}
