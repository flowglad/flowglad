'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '@/utils/authClient'
import { MigrationButton as Button } from '@/components/ui/button-migration'
import { LogOut, ChevronLeft, User, AlertCircle } from 'lucide-react'
import { trpc } from '@/app/_trpc/client'
import { toast } from 'sonner'
import { use } from 'react'

interface BillingPortalPageProps {
  params: Promise<{
    organizationId: string
    customerId: string
  }>
}

const BillingPortalPage = ({ params }: BillingPortalPageProps) => {
  const { organizationId, customerId } = use(params)
  const router = useRouter()
  const { data: session } = useSession()
  const logoutMutation = trpc.utils.logout.useMutation()

  // Check if user has multiple customer profiles
  const { data: customersData } =
    trpc.customerBillingPortal.getCustomersForUserAndOrganization.useQuery(
      {},
      {
        enabled: !!session?.user,
      }
    )

  const {
    data: customerBilling,
    isLoading: isLoadingCustomerBilling,
  } = trpc.customerBillingPortal.getBilling.useQuery(
    {},
    {
      enabled: !!session?.user && !!customerId,
    }
  )

  const hasMultipleCustomers =
    (customersData?.customers?.length ?? 0) > 1

  // Validate that the user has access to this specific customer
  const currentCustomer = customersData?.customers?.find(
    (c) => c.id === customerId
  )

  useEffect(() => {
    if (!session) {
      router.push('/sign-in')
      return
    }

    // If customers are loaded and current customer is not in the list
    if (customersData?.customers && !currentCustomer) {
      toast.error('Access denied to this customer profile')
      router.replace(
        `/billing-portal/${organizationId}/select-customer`
      )
    }
  }, [
    session,
    customersData,
    currentCustomer,
    organizationId,
    router,
    customerId,
  ])

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync()
      router.push('/sign-in')
    } catch (error) {
      // Log error for debugging but don't show to user
      console.error('Logout failed:', error)
      // Still redirect to sign-in even if mutation fails
      // This ensures user can still leave the page
      router.push('/sign-in')
    }
  }

  const handleChangeCustomer = () => {
    router.push(`/billing-portal/${organizationId}/select-customer`)
  }
  const customer = customerBilling?.customer
  if (isLoadingCustomerBilling) {
    return <></>
  }
  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <h2 className="text-2xl font-bold">Customer not found</h2>
        </div>
      </div>
    )
  }
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">Billing Portal</h1>
              {hasMultipleCustomers && (
                <Button
                  onClick={handleChangeCustomer}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <ChevronLeft size={16} />
                  Change Customer
                </Button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User size={16} />
                <span>{customer.name || customer.email}</span>
              </div>
              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <LogOut size={16} />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 container mx-auto px-6 py-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {/* Customer Info Card */}
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">
              Customer Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">
                  {customer.name || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{customer.email}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Customer ID
                </p>
                <p className="font-mono text-sm">{customer.id}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Created
                </p>
                <p className="font-medium">
                  {new Date(customer.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Placeholder sections for future components */}
          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">
              Subscription
            </h2>
            <p className="text-muted-foreground">
              Subscription information will be displayed here
            </p>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">
              Payment Methods
            </h2>
            <p className="text-muted-foreground">
              Payment methods will be displayed here
            </p>
          </div>

          <div className="rounded-lg border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Invoices</h2>
            <p className="text-muted-foreground">
              Invoice history will be displayed here
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BillingPortalPage
