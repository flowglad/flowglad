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
         * First split: Route customerBillingPortal procedures to dedicated customer handler
         */
        splitLink({
          condition(op) {
            return op.path.startsWith('customerBillingPortal.')
          },
          // true branch -> use customer endpoint
          true: [
            /**
             * Nested split for streaming support on customer routes
             */
            splitLink({
              condition(op) {
                return op.path.endsWith('.streaming')
              },
              true: [
                httpBatchStreamLink({
                  url: `${core.envVariable('APP_URL')}/api/trpc/customer`,
                  transformer: SuperJSON,
                }),
              ],
              false: [
                httpBatchLink({
                  url: `${core.envVariable('APP_URL')}/api/trpc/customer`,
                  transformer: SuperJSON,
                }),
              ],
            }),
          ],
          // false branch -> use default merchant endpoint
          false: [
            /**
             * Nested split for streaming support on merchant routes
             */
            splitLink({
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
