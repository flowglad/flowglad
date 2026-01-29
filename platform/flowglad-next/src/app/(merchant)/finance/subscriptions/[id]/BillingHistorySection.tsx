'use client'

import { PaymentMethodType } from '@db-core/enums'
import { encodeCursor } from '@db-core/tableUtils'
import {
  ChevronRight,
  CircleAlert,
  ReceiptText,
  Rewind,
  RotateCcw,
} from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import { ExpandSection } from '@/components/ExpandSection'
import {
  type BillingHistoryStatus,
  ItemBillingHistory,
} from '@/components/ItemBillingHistory'
import type { PopoverMenuItem } from '@/components/PopoverMenu'
import RefundPaymentModal from '@/components/payments/RefundPaymentModal'
import RetryPaymentModal from '@/components/payments/RetryPaymentModal'
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Payment } from '@/db/schema/payments'
import { PaymentStatus } from '@/types'
import core from '@/utils/core'
import { getCurrencyParts } from '@/utils/stripe'

interface BillingHistorySectionProps {
  subscriptionId: string
  customerId: string
  customerName: string
}

/**
 * Maps PaymentStatus to BillingHistoryStatus for the ItemBillingHistory component
 */
const mapPaymentStatusToBillingHistoryStatus = (
  status: PaymentStatus,
  refunded: boolean
): BillingHistoryStatus => {
  if (refunded) {
    return 'refunded'
  }

  switch (status) {
    case PaymentStatus.Succeeded:
      return 'paid'
    case PaymentStatus.Processing:
    case PaymentStatus.RequiresAction:
    case PaymentStatus.RequiresConfirmation:
      return 'pending'
    case PaymentStatus.Failed:
    case PaymentStatus.Canceled:
      return 'failed'
    case PaymentStatus.Refunded:
      return 'refunded'
    default:
      return 'pending'
  }
}

/**
 * Extracts card brand and last4 from payment method data
 */
const getPaymentMethodInfo = (
  paymentMethod: PaymentMethod.ClientRecord | undefined
): { brand?: string; last4?: string } => {
  if (!paymentMethod) {
    return {}
  }

  const data = paymentMethod.paymentMethodData as Record<
    string,
    unknown
  >

  if (paymentMethod.type === PaymentMethodType.Card) {
    return {
      brand: data.brand as string | undefined,
      last4: data.last4 as string | undefined,
    }
  }

  if (paymentMethod.type === PaymentMethodType.USBankAccount) {
    return {
      last4: data.last4 as string | undefined,
    }
  }

  return {}
}

interface BillingHistoryItemWithPayment {
  id: string
  date: string
  status: BillingHistoryStatus
  paymentMethodBrand?: string
  paymentMethodLast4?: string
  amount: string
  payment: Payment.ClientRecord
}

/**
 * Individual billing history item with actions menu
 */
function BillingHistoryItem({
  item,
  onClick,
}: {
  item: BillingHistoryItemWithPayment
  /** TODO: Add onClick handler once payment detail page is created */
  onClick?: () => void
}) {
  const [isRefundOpen, setIsRefundOpen] = React.useState(false)
  const [isRetryOpen, setIsRetryOpen] = React.useState(false)

  const menuItems: PopoverMenuItem[] = React.useMemo(() => {
    const items: PopoverMenuItem[] = []

    // View Invoice option - only shown if there's an invoice
    if (item.payment.invoiceId) {
      const invoiceUrl = `${core.NEXT_PUBLIC_APP_URL}/invoice/view/${item.payment.organizationId}/${item.payment.invoiceId}`
      items.push({
        label: 'View Invoice',
        icon: <ReceiptText className="h-4 w-4" />,
        handler: () => window.open(invoiceUrl, '_blank'),
      })
    }

    // Refund option - only enabled for succeeded payments
    items.push({
      label: 'Refund Payment',
      icon: <Rewind className="h-4 w-4" />,
      disabled: item.payment.status !== PaymentStatus.Succeeded,
      helperText:
        item.payment.status !== PaymentStatus.Succeeded
          ? 'Only succeeded payments can be refunded'
          : undefined,
      handler: () => setIsRefundOpen(true),
    })

    // Retry option - only for failed payments with a billing period
    if (
      item.payment.status === PaymentStatus.Failed &&
      !!item.payment.billingPeriodId
    ) {
      items.push({
        label: 'Retry Payment',
        icon: <RotateCcw className="h-4 w-4" />,
        handler: () => setIsRetryOpen(true),
      })
    }

    return items
  }, [item.payment])

  return (
    <>
      <ItemBillingHistory
        date={item.date}
        status={item.status}
        paymentMethodBrand={item.paymentMethodBrand}
        paymentMethodLast4={item.paymentMethodLast4}
        amount={item.amount}
        menuItems={menuItems}
        onClick={onClick}
      />
      <RefundPaymentModal
        isOpen={isRefundOpen}
        setIsOpen={setIsRefundOpen}
        payment={item.payment}
      />
      <RetryPaymentModal
        isOpen={isRetryOpen}
        setIsOpen={setIsRetryOpen}
        payment={item.payment}
      />
    </>
  )
}

export function BillingHistorySection({
  subscriptionId,
  customerId,
  customerName,
}: BillingHistorySectionProps) {
  // Fetch payments for this subscription using cursor pagination
  const { data: paymentsData, isLoading: isLoadingPayments } =
    trpc.payments.getTableRows.useQuery({
      filters: { subscriptionId },
      pageSize: 10,
    })

  // Fetch payment methods for the customer
  const {
    data: paymentMethodsData,
    isLoading: isLoadingPaymentMethods,
  } = trpc.paymentMethods.list.useQuery({
    cursor: encodeCursor({ parameters: { customerId } }),
    limit: 100,
  })

  const isLoading = isLoadingPayments || isLoadingPaymentMethods

  // Create a map of payment method ID to payment method for quick lookup
  const paymentMethodsById = new Map(
    paymentMethodsData?.data?.map((pm) => [pm.id, pm]) ?? []
  )

  // Map payments to billing history items (including full payment data for actions)
  const billingHistoryItems: BillingHistoryItemWithPayment[] =
    paymentsData?.items?.map((item) => {
      const payment = item.payment as Payment.ClientRecord
      const paymentMethod = payment.paymentMethodId
        ? paymentMethodsById.get(payment.paymentMethodId)
        : undefined
      const { brand, last4 } = getPaymentMethodInfo(paymentMethod)

      const { symbol, value } = getCurrencyParts(
        payment.currency,
        payment.amount
      )

      return {
        id: payment.id,
        date: core.formatDate(payment.chargeDate),
        status: mapPaymentStatusToBillingHistoryStatus(
          payment.status,
          payment.refunded
        ),
        paymentMethodBrand: brand,
        paymentMethodLast4: last4,
        amount: `${symbol}${value}`,
        payment,
      }
    }) ?? []

  // TODO: Add click handler to navigate to payment detail page once it's created
  // const handlePaymentClick = (paymentId: string) => {
  //   router.push(`/finance/payments/${paymentId}`)
  // }

  // Get the customer's first name for the link text
  const customerFirstName =
    customerName.split(' ')[0] || customerName || 'this customer'

  return (
    <ExpandSection title="Billing History" defaultExpanded={false}>
      <div className="flex flex-col gap-0 w-full">
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            Loading billing history...
          </div>
        ) : billingHistoryItems.length === 0 ? (
          <Alert variant="secondary">
            <CircleAlert className="size-4" />
            <div className="flex flex-col gap-1 min-w-0 grow">
              <AlertTitle>No billing history yet</AlertTitle>
              <AlertDescription>
                {customerName} hasn't made any payments for this
                subscription yet.
              </AlertDescription>
              <Link
                href={`/customers/${customerId}?tab=payments`}
                className="flex items-center text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                View All Payments for {customerFirstName}
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </Alert>
        ) : (
          billingHistoryItems.map((item) => (
            <BillingHistoryItem key={item.id} item={item} />
          ))
        )}
      </div>
    </ExpandSection>
  )
}
