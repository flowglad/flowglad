'use client'

import { SubscriptionStatus } from '@db-core/enums'
import type { Customer } from '@db-core/schema/customers'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ArchiveCustomerModalProps {
  customer: Customer.ClientRecord
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

function SubscriptionInfo({
  isLoading,
  activeCount,
  error,
}: {
  isLoading: boolean
  activeCount: number
  error?: unknown
}) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading subscription information...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-3">
        <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-destructive">
            Failed to load subscription information
          </p>
          <p className="text-muted-foreground mt-1">
            Could not verify active subscriptions. Please close and
            try again, or proceed with caution as active subscriptions
            may be canceled.
          </p>
        </div>
      </div>
    )
  }

  if (activeCount > 0) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-destructive/20 bg-destructive/5 p-3">
        <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-destructive">
            {activeCount} active{' '}
            {activeCount === 1 ? 'subscription' : 'subscriptions'}{' '}
            will be canceled
          </p>
          <p className="text-muted-foreground mt-1">
            All active subscriptions for this customer will be
            immediately canceled when you archive them.
          </p>
        </div>
      </div>
    )
  }

  return (
    <p className="text-sm text-muted-foreground">
      This customer has no active subscriptions.
    </p>
  )
}

const ArchiveCustomerModal: React.FC<ArchiveCustomerModalProps> = ({
  customer,
  open,
  onOpenChange,
  onSuccess,
}) => {
  const router = useRouter()
  const archiveCustomer = trpc.customers.archive.useMutation()

  // Fetch active subscriptions count for the customer
  const {
    data: subscriptionsData,
    isLoading: isLoadingSubscriptions,
    error: subscriptionsError,
  } = trpc.subscriptions.getTableRows.useQuery(
    {
      filters: {
        customerId: customer.id,
        status: SubscriptionStatus.Active,
      },
      pageSize: 1, // We only need the total count
    },
    {
      enabled: open,
    }
  )

  const activeSubscriptionCount = subscriptionsData?.total ?? 0

  const handleArchive = async () => {
    try {
      await archiveCustomer.mutateAsync({
        externalId: customer.externalId,
      })
      router.refresh()
      onOpenChange(false)
      onSuccess?.()
    } catch (error) {
      console.error('Failed to archive customer:', error)
      toast.error('Failed to archive customer. Please try again.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive customer</DialogTitle>
          <DialogDescription>
            Are you sure you want to archive{' '}
            <span className="font-medium">{customer.name}</span>
            {customer.email && (
              <>
                {' '}
                (<span className="font-medium">{customer.email}</span>
                )
              </>
            )}
            ?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <SubscriptionInfo
            isLoading={isLoadingSubscriptions}
            activeCount={activeSubscriptionCount}
            error={subscriptionsError}
          />

          <p className="text-sm text-muted-foreground">
            Archiving a customer will:
          </p>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            <li>Hide them from the active customers list</li>
            <li>Free their external ID for reuse</li>
            <li>Prevent new operations on this customer</li>
          </ul>

          <p className="text-sm text-muted-foreground">
            This action cannot be undone.
          </p>
        </div>

        <DialogFooter>
          <div className="flex justify-end gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleArchive}
              disabled={
                archiveCustomer.isPending || isLoadingSubscriptions
              }
            >
              {archiveCustomer.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Archiving...
                </>
              ) : (
                'Archive customer'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ArchiveCustomerModal
