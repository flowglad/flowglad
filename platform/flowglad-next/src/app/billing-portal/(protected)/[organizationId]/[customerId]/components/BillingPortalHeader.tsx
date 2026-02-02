'use client'

import { LogOut, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'

interface BillingPortalHeaderProps {
  customer: {
    id: string
    name: string | null
    email: string
    organizationName?: string | null
  } | null
  loading?: boolean
}

export function BillingPortalHeader({
  customer,
  loading,
}: BillingPortalHeaderProps) {
  const router = useRouter()
  const logoutMutation = trpc.utils.logout.useMutation()

  const handleLogout = async () => {
    const currentPath = window.location.pathname
    const pathSegments = currentPath.split('/')
    const organizationId = pathSegments[2] // Should be org_xxx
    const billingPortalPath = `/billing-portal/${organizationId}`
    router.push(
      `/logout?redirect=${encodeURIComponent(billingPortalPath)}`
    )
  }
  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4 max-w-6xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl">Billing Portal</h1>
            {loading ? (
              <div className="h-8 w-48 bg-muted/10 rounded animate-pulse" />
            ) : customer?.organizationName ? (
              <span className="text-sm text-muted-foreground">
                {customer.organizationName}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-4">
            {loading ? (
              <>
                <div className="h-10 w-10 rounded-full bg-muted/10 animate-pulse" />
                <div className="flex flex-col gap-1">
                  <div className="h-4 w-32 bg-muted/10 rounded animate-pulse" />
                  <div className="h-3 w-24 bg-muted/10 rounded animate-pulse" />
                </div>
                <div className="h-10 w-24 bg-muted/10 rounded animate-pulse" />
              </>
            ) : customer ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {customer.name || 'Customer'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {customer.email}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                  disabled={logoutMutation.isPending}
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <Button
                  onClick={handleLogout}
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
