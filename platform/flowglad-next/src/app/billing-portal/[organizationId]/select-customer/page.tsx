'use client'

import { Loader2 } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { trpc } from '@/app/_trpc/client'
import { CustomerSelector } from '@/registry/base/customer-selector/customer-selector'
import { useSession } from '@/utils/authClient'

export default function SelectCustomerPage() {
  const router = useRouter()
  const params = useParams<{ organizationId: string }>()
  const { organizationId } = params
  const { data: session, isPending: isSessionLoading } = useSession()

  // Fetch customers for the logged-in user
  const {
    data: customersData,
    isLoading: isLoadingCustomers,
    error,
  } = trpc.customerBillingPortal.getCustomersForUserAndOrganization.useQuery(
    {},
    {
      enabled: !!session?.user && !!organizationId,
    }
  )

  // Auto-redirect if only one customer
  useEffect(() => {
    if (
      customersData?.customers &&
      customersData.customers.length === 1
    ) {
      const singleCustomer = customersData.customers[0]
      router.push(
        `/billing-portal/${organizationId}/${singleCustomer.id}`
      )
    }
  }, [customersData, organizationId, router])

  const handleCustomerSelect = (customerId: string) => {
    router.push(`/billing-portal/${organizationId}/${customerId}`)
  }

  // Loading state
  if (isSessionLoading || isLoadingCustomers) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">
            Loading customers...
          </p>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full text-center space-y-4 p-6">
          <h2 className="text-2xl text-destructive">
            Error Loading Customers
          </h2>
          <p className="text-muted-foreground">{error.message}</p>
          <button
            onClick={() => router.push('/billing-portal')}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  // No customers found
  if (
    !customersData?.customers ||
    customersData.customers.length === 0
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md w-full text-center space-y-4 p-6">
          <h2 className="text-2xl">No Customers Found</h2>
          <p className="text-muted-foreground">
            No customer profiles found for your email address in this
            organization.
          </p>
          <p className="text-sm text-muted-foreground">
            Please contact support if you believe this is an error.
          </p>
        </div>
      </div>
    )
  }

  // Transform customer data to match CustomerProfile interface
  const customerProfiles = customersData.customers.map(
    (customer) => ({
      id: customer.id,
      name: customer.name || customer.email,
      email: customer.email,
      organizationId: customer.organizationId,
      organizationName: undefined, // Will be populated if needed
      createdAt: new Date(customer.createdAt),
      avatarUrl: customer.iconURL || undefined,
      metadata: undefined, // Customer schema doesn't have metadata field
    })
  )

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="text-3xl">Select Customer Profile</h1>
            <p className="text-muted-foreground">
              Choose which customer profile you want to manage
            </p>
          </div>

          {customersData.customers.length > 1 && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                You have multiple customer profiles. Please select the
                one you want to access.
              </p>
            </div>
          )}

          <CustomerSelector
            customers={customerProfiles}
            onSelect={handleCustomerSelect}
            loading={false}
            searchable={customersData.customers.length > 4}
            emptyStateMessage="No customer profiles found"
            gridCols={3}
          />
        </div>
      </div>
    </div>
  )
}
