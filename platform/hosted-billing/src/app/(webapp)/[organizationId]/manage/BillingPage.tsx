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
    >
      <div className="h-full w-full justify-center flex">
        <div className="w-2/5 h-full pt-16">
          <FlowgladBillingPage darkMode={true} />
        </div>
      </div>
    </FlowgladProvider>
  )
}
