'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signOut } from '@/utils/authClient'
import Button from '@/components/ion/Button'
import { LogOut, ChevronLeft, User } from 'lucide-react'
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
  const logoutMutation = trpc.utils.logout.useMutation()

  // Validate customer access
  const {
    data: accessData,
    isLoading: isValidating,
    error: accessError,
  } = trpc.customerBillingPortal.validateCustomerAccess.useQuery(
    {
      customerId,
      organizationId,
    },
    {
      enabled: !!customerId && !!organizationId,
    }
  )

  // Check if user has multiple customer profiles
  const { data: customersData } =
    trpc.customerBillingPortal.getCustomersByEmail.useQuery(
      {
        email: accessData?.customer?.email ?? '',
        organizationId,
      },
      {
        enabled: !!accessData?.customer?.email && !!organizationId,
      }
    )

  const hasMultipleCustomers =
    customersData?.customers && customersData.customers.length > 1

  useEffect(() => {
    if (accessError) {
      toast.error('Access denied to this customer profile')
      router.push(`/billing-portal/${organizationId}/select-customer`)
    }
  }, [accessError, organizationId, router])

  const handleLogout = async () => {
    await logoutMutation.mutateAsync()
    await signOut()
    router.push('/sign-in')
  }

  const handleChangeCustomer = () => {
    router.push(`/billing-portal/${organizationId}/select-customer`)
  }

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">
            Validating access...
          </p>
        </div>
      </div>
    )
  }

  if (!accessData?.hasAccess) {
    return null // Will redirect via useEffect
  }

  const customer = accessData.customer

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
