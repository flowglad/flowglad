'use client'
import {
  FlowgladProvider,
  BillingPage as FlowgladBillingPage,
} from '@flowglad/nextjs'

export function BillingPage({
  organizationId,
}: {
  organizationId: string
}) {
  return (
    <FlowgladProvider
      loadBilling={true}
      serverRoute={`/api/${organizationId}/flowglad`}
      requestConfig={{
        serverRoute: `/api/${organizationId}/flowglad`,
      }}
      theme={{
        mode: 'dark',
        dark: {
          background: '#1b1b1b',
          card: 'rgb(35 35 35)',
          destructive: 'hsl(0 87% 37%)',
          border: 'rgb(55 55 55)',
        },
      }}
    >
      <div className="h-full w-full justify-center flex">
        <div className="w-2/5 h-full pt-16">
          <FlowgladBillingPage darkMode={true} />
        </div>
      </div>
    </FlowgladProvider>
  )
}
