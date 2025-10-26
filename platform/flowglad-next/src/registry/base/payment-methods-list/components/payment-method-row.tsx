import React, { useState } from 'react'
import { MoreHorizontal, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { CardBrandLogo } from './card-brand-logo'
import type { PaymentMethodRowProps } from '../types'

export function PaymentMethodRow({
  paymentMethod,
  isDefault = false,
  onRemove,
  onSetDefault,
  loading = false,
}: PaymentMethodRowProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isSettingDefault, setIsSettingDefault] = useState(false)

  const handleRemove = async () => {
    if (!onRemove) return
    setIsRemoving(true)
    try {
      await onRemove(paymentMethod.id)
      setIsPopoverOpen(false)
    } catch (error) {
      console.error('Failed to remove payment method:', error)
    } finally {
      setIsRemoving(false)
    }
  }

  const handleSetDefault = async () => {
    if (!onSetDefault || isDefault) return
    setIsSettingDefault(true)
    try {
      await onSetDefault(paymentMethod.id)
      setIsPopoverOpen(false)
    } catch (error) {
      console.error('Failed to set default payment method:', error)
    } finally {
      setIsSettingDefault(false)
    }
  }

  const formatExpiry = () => {
    if (
      paymentMethod.type === 'card' &&
      paymentMethod.expiryMonth &&
      paymentMethod.expiryYear
    ) {
      return `${String(paymentMethod.expiryMonth).padStart(2, '0')}/${String(paymentMethod.expiryYear).slice(-2)}`
    }
    return null
  }
  const showPopover = onRemove || (onSetDefault && !isDefault)
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors">
      <div className="flex items-center gap-4">
        {paymentMethod.type === 'card' && (
          <CardBrandLogo brand={paymentMethod.brand || ''} />
        )}

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {paymentMethod.type === 'card' &&
                `•••• ${paymentMethod.last4}`}
              {paymentMethod.type === 'bank_account' &&
                `•••• ${paymentMethod.last4}`}
              {paymentMethod.type === 'paypal' && paymentMethod.email}
              {paymentMethod.type === 'other' &&
                paymentMethod.description}
            </span>
            {isDefault && (
              <Badge variant="secondary" className="text-xs">
                Default
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {paymentMethod.type === 'card' && formatExpiry() && (
              <span>Expires {formatExpiry()}</span>
            )}
            {paymentMethod.type === 'bank_account' &&
              paymentMethod.bankName && (
                <span>{paymentMethod.bankName}</span>
              )}
          </div>
        </div>
      </div>

      {showPopover && (
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={loading || isRemoving || isSettingDefault}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Payment method options</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48">
            <div className="flex flex-col gap-1">
              {onSetDefault && !isDefault && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={handleSetDefault}
                  disabled={isSettingDefault}
                >
                  Set as Default
                </Button>
              )}
              {onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start text-destructive hover:text-destructive"
                  onClick={handleRemove}
                  disabled={isRemoving || isDefault}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
