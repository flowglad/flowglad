import { Plus } from 'lucide-react'
import React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AddPaymentMethodButtonProps } from '../types'

export function AddPaymentMethodButton({
  onClick,
  loading = false,
  className,
}: AddPaymentMethodButtonProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={loading}
      variant="outline"
      className={cn('w-full', className)}
    >
      <Plus className="h-4 w-4 mr-2" />
      Add Payment Method
    </Button>
  )
}
