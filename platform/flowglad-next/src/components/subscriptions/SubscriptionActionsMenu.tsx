'use client'

import { PriceType } from '@db-core/enums'
import type { Subscription } from '@db-core/schema/subscriptions'
import { Settings2, X } from 'lucide-react'
import * as React from 'react'
import CancelSubscriptionModal from '@/components/forms/CancelSubscriptionModal'
import {
  type ActionMenuItem,
  EnhancedDataTableActionsMenu,
} from '@/components/ui/enhanced-data-table-actions-menu'
import { getSubscriptionActionState } from './subscription-action-state'

interface SubscriptionActionsMenuProps {
  onAdjust: () => void
  priceType: PriceType
  subscription: Subscription.ClientRecord
}

export function SubscriptionActionsMenu({
  onAdjust,
  priceType,
  subscription,
}: SubscriptionActionsMenuProps) {
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

  const actionItems: ActionMenuItem[] = [
    {
      label: 'Adjust Plan',
      icon: <Settings2 className="h-4 w-4" />,
      handler: onAdjust,
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

  return (
    <EnhancedDataTableActionsMenu items={actionItems}>
      <CancelSubscriptionModal
        isOpen={isCancelOpen}
        setIsOpen={setIsCancelOpen}
        subscriptionId={subscription.id}
      />
    </EnhancedDataTableActionsMenu>
  )
}
