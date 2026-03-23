'use client'

import { PriceType } from '@db-core/enums'
import type { Subscription } from '@db-core/schema/subscriptions'
import { Settings2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'
import { trpc } from '@/app/_trpc/client'
import { AdjustSubscriptionModal } from '@/app/(merchant)/finance/subscriptions/[id]/AdjustSubscriptionModal'
import CancelSubscriptionModal from '@/components/forms/CancelSubscriptionModal'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { getSubscriptionActionState } from './subscription-action-state'

interface SubscriptionActionsMenuProps {
  adjustBehavior: 'modal' | 'navigate'
  priceType: PriceType
  subscription: Subscription.ClientRecord
}

const LoadingAdjustSubscriptionDialog = ({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean
  setIsOpen: (isOpen: boolean) => void
}) => (
  <Dialog open={isOpen} onOpenChange={setIsOpen}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Adjust Subscription</DialogTitle>
      </DialogHeader>
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </DialogContent>
  </Dialog>
)

export function SubscriptionActionsMenu({
  adjustBehavior,
  priceType,
  subscription,
}: SubscriptionActionsMenuProps) {
  const router = useRouter()
  const [isAdjustOpen, setIsAdjustOpen] = React.useState(false)
  const [isCancelOpen, setIsCancelOpen] = React.useState(false)

  const {
    adjustHelperText,
    cancelHelperText,
    cannotAdjust,
    cannotCancel,
  } = getSubscriptionActionState({
    subscription,
    priceType,
  })

  const adjustContextQuery =
    trpc.subscriptions.getAdjustContext.useQuery(
      { id: subscription.id },
      {
        enabled: adjustBehavior === 'modal' && isAdjustOpen,
        refetchOnMount: 'always',
        staleTime: 0,
      }
    )

  React.useEffect(() => {
    if (
      adjustBehavior !== 'modal' ||
      !isAdjustOpen ||
      !adjustContextQuery.error
    ) {
      return
    }

    toast.error('Failed to load subscription details', {
      description: adjustContextQuery.error.message,
    })
    setIsAdjustOpen(false)
  }, [adjustBehavior, adjustContextQuery.error, isAdjustOpen])

  const handleAdjust = React.useCallback(() => {
    if (adjustBehavior === 'navigate') {
      router.push(`/finance/subscriptions/${subscription.id}`)
      return
    }

    setIsAdjustOpen(true)
  }, [adjustBehavior, router, subscription.id])

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Adjust Plan',
      icon: <Settings2 className="h-4 w-4" />,
      handler: handleAdjust,
      disabled: cannotAdjust,
      helperText: adjustHelperText,
    },
    {
      label: 'Cancel Subscription',
      icon: <X className="h-4 w-4" />,
      handler: () => setIsCancelOpen(true),
      destructive: true,
      disabled: cannotCancel,
      helperText: cancelHelperText,
    },
  ]

  const adjustContext = adjustContextQuery.data?.subscription
  const showLoadingAdjustDialog =
    adjustBehavior === 'modal' &&
    isAdjustOpen &&
    !adjustContext &&
    adjustContextQuery.isLoading

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <CancelSubscriptionModal
        isOpen={isCancelOpen}
        setIsOpen={setIsCancelOpen}
        subscriptionId={subscription.id}
      />
      {showLoadingAdjustDialog ? (
        <LoadingAdjustSubscriptionDialog
          isOpen={isAdjustOpen}
          setIsOpen={setIsAdjustOpen}
        />
      ) : null}
      {adjustBehavior === 'modal' && adjustContext ? (
        <AdjustSubscriptionModal
          isOpen={isAdjustOpen}
          setIsOpen={setIsAdjustOpen}
          subscription={adjustContext}
          pricingModelId={adjustContext.pricingModelId}
        />
      ) : null}
    </EnhancedDataTableActionsMenu>
  )
}
