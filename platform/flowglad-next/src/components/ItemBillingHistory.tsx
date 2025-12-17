import {
  Check,
  Clock,
  MoreHorizontal,
  RotateCcw,
  X,
} from 'lucide-react'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { CardLogoBadge } from './PaymentMethodLabel'
import PopoverMenu, { type PopoverMenuItem } from './PopoverMenu'

export type BillingHistoryStatus =
  | 'paid'
  | 'pending'
  | 'failed'
  | 'refunded'

export interface ItemBillingHistoryProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** The date of the billing transaction */
  date: string
  /** The status of the payment */
  status: BillingHistoryStatus
  /** The payment method brand (e.g., "visa", "mastercard") */
  paymentMethodBrand?: string
  /** The last 4 digits of the payment method */
  paymentMethodLast4?: string
  /** The amount displayed (formatted string, e.g., "$9.99") */
  amount: string
  /** Menu items for the popover menu */
  menuItems?: PopoverMenuItem[]
  /** Optional click handler for the row */
  onClick?: () => void
}

/**
 * Status badge configuration for different payment statuses
 */
const statusConfig: Record<
  BillingHistoryStatus,
  {
    label: string
    bgClass: string
    textClass: string
    iconClass: string
    Icon: typeof Check
  }
> = {
  paid: {
    label: 'Paid',
    bgClass: 'bg-jade-background',
    textClass: 'text-jade-foreground',
    iconClass: 'text-jade-foreground',
    Icon: Check,
  },
  pending: {
    label: 'Pending',
    bgClass: 'bg-amber-100',
    textClass: 'text-amber-700',
    iconClass: 'text-amber-700',
    Icon: Clock,
  },
  failed: {
    label: 'Failed',
    bgClass: 'bg-red-100',
    textClass: 'text-red-700',
    iconClass: 'text-red-700',
    Icon: X,
  },
  refunded: {
    label: 'Refunded',
    bgClass: 'bg-gray-100',
    textClass: 'text-gray-700',
    iconClass: 'text-gray-700',
    Icon: RotateCcw,
  },
}

/**
 * ItemBillingHistory component
 *
 * Displays a billing history row item with date, status, payment method,
 * amount, and an optional actions menu.
 *
 * Based on the Flowglad Design System.
 *
 * @example
 * ```tsx
 * <ItemBillingHistory
 *   date="4 Nov, 2025"
 *   status="paid"
 *   paymentMethodBrand="visa"
 *   paymentMethodLast4="4242"
 *   amount="$9.99"
 *   menuItems={[
 *     { label: 'View invoice', handler: () => {} },
 *     { label: 'Download receipt', handler: () => {} },
 *   ]}
 * />
 * ```
 */
const ItemBillingHistory = React.forwardRef<
  HTMLDivElement,
  ItemBillingHistoryProps
>(
  (
    {
      className,
      date,
      status,
      paymentMethodBrand,
      paymentMethodLast4,
      amount,
      menuItems,
      onClick,
      ...props
    },
    ref
  ) => {
    const isClickable = Boolean(onClick)
    const config = statusConfig[status]

    return (
      <div
        ref={ref}
        data-slot="item-billing-history"
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onClick?.()
                }
              }
            : undefined
        }
        className={cn(
          'group flex items-center gap-3 py-2 px-3 rounded-[6px] transition-colors w-full',
          isClickable && 'cursor-pointer',
          'hover:bg-accent/50',
          className
        )}
        {...props}
      >
        {/* Date cell */}
        <div className="flex items-center shrink-0 w-[100px]">
          <span className="font-sans font-normal text-sm leading-5 text-foreground whitespace-nowrap">
            {date}
          </span>
        </div>

        {/* Status badge cell */}
        <div className="flex items-center shrink-0 w-[90px]">
          <Badge
            variant="secondary"
            className={cn(
              'flex items-center gap-1 px-1.5 py-0.5 rounded border-transparent',
              config.bgClass
            )}
          >
            <config.Icon
              className={cn('size-3.5 shrink-0', config.iconClass)}
              strokeWidth={2}
            />
            <span
              className={cn(
                'font-sans font-medium text-sm leading-[1.2]',
                config.textClass
              )}
            >
              {config.label}
            </span>
          </Badge>
        </div>

        {/* Payment method cell - hidden on mobile */}
        <div className="hidden md:flex items-center justify-end gap-1 flex-1 min-w-0">
          {paymentMethodBrand && (
            <div className="shrink-0">
              <CardLogoBadge brand={paymentMethodBrand} />
            </div>
          )}
          {paymentMethodLast4 && (
            <div className="flex items-center gap-0.5 text-sm font-normal text-foreground min-w-[65px] w-fit">
              <span>••••</span>
              <span>{paymentMethodLast4}</span>
            </div>
          )}
        </div>

        {/* Amount cell */}
        <div className="flex items-center justify-end flex-1 md:max-w-24">
          <span className="font-sans font-normal text-sm leading-5 text-foreground whitespace-nowrap text-right">
            {amount}
          </span>
        </div>

        {/* More menu cell */}
        <div className="flex items-center justify-end shrink-0">
          {menuItems && menuItems.length > 0 ? (
            <div onClick={(e) => e.stopPropagation()}>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    className="data-[state=open]:bg-muted text-muted-foreground size-6 border border-transparent hover:border-muted-foreground hover:shadow-xs"
                    size="icon"
                  >
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-fit p-1" align="end">
                  <PopoverMenu items={menuItems} />
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className="size-6" />
          )}
        </div>
      </div>
    )
  }
)
ItemBillingHistory.displayName = 'ItemBillingHistory'

export { ItemBillingHistory }
