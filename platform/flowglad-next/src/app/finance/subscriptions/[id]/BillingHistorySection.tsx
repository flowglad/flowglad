'use client'

import {
  ChevronRight,
  CircleAlert,
  ReceiptText,
  Rewind,
  RotateCcw,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { trpc } from '@/app/_trpc/client'
import RefundPaymentModal from '@/app/finance/payments/RefundPaymentModal'
import RetryPaymentModal from '@/app/finance/payments/RetryPaymentModal'
import { ExpandSection } from '@/components/ExpandSection'
import {
  type BillingHistoryStatus,
  ItemBillingHistory,
} from '@/components/ItemBillingHistory'
import type { PopoverMenuItem } from '@/components/PopoverMenu'
import type { PaymentMethod } from '@/db/schema/paymentMethods'
import type { Payment } from '@/db/schema/payments'
import { encodeCursor } from '@/db/tableUtils'
import {
  CurrencyCode,
  PaymentMethodType,
  PaymentStatus,
} from '@/types'
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

// TODO: Remove this fake data - for testing purposes only
const createFakePayment = (
  id: string,
  status: PaymentStatus,
  hasBillingPeriod: boolean
): Payment.ClientRecord =>
  ({
    id,
    status,
    amount: 9900,
    currency: CurrencyCode.USD,
    chargeDate: Date.now(),
    customerId: 'fake-customer-id',
    organizationId: 'fake-org-id',
    paymentMethodId: null,
    billingPeriodId: hasBillingPeriod
      ? 'fake-billing-period-id'
      : null,
    refunded: status === PaymentStatus.Refunded,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    livemode: false,
    invoiceId: 'fake-invoice-id',
    stripePaymentIntentId: 'fake-stripe-payment-intent-id',
    purchaseId: null,
    subscriptionId: null,
    description: null,
    subtotal: 9900,
    taxAmount: null,
    paymentMethod: PaymentMethodType.Card,
  }) as unknown as Payment.ClientRecord

const FAKE_BILLING_HISTORY_DATA: BillingHistoryItemWithPayment[] = [
  {
    id: 'fake-payment-1',
    date: 'Dec 11, 2024',
    status: 'paid' as const,
    paymentMethodBrand: 'visa',
    paymentMethodLast4: '4242',
    amount: '$99.00',
    payment: createFakePayment(
      'fake-payment-1',
      PaymentStatus.Succeeded,
      true
    ),
  },
  {
    id: 'fake-payment-2',
    date: 'Nov 11, 2024',
    status: 'paid' as const,
    paymentMethodBrand: 'mastercard',
    paymentMethodLast4: '5555',
    amount: '$99.00',
    payment: createFakePayment(
      'fake-payment-2',
      PaymentStatus.Succeeded,
      true
    ),
  },
  {
    id: 'fake-payment-3',
    date: 'Oct 11, 2024',
    status: 'refunded' as const,
    paymentMethodBrand: 'visa',
    paymentMethodLast4: '4242',
    amount: '$99.00',
    payment: createFakePayment(
      'fake-payment-3',
      PaymentStatus.Refunded,
      true
    ),
  },
  {
    id: 'fake-payment-4',
    date: 'Sep 11, 2024',
    status: 'paid' as const,
    paymentMethodBrand: 'amex',
    paymentMethodLast4: '1234',
    amount: '$149.00',
    payment: createFakePayment(
      'fake-payment-4',
      PaymentStatus.Succeeded,
      true
    ),
  },
  {
    id: 'fake-payment-5',
    date: 'Aug 11, 2024',
    status: 'failed' as const,
    paymentMethodBrand: 'visa',
    paymentMethodLast4: '9999',
    amount: '$99.00',
    payment: createFakePayment(
      'fake-payment-5',
      PaymentStatus.Failed,
      true
    ),
  },
  {
    id: 'fake-payment-6',
    date: 'Jul 11, 2024',
    status: 'pending' as const,
    paymentMethodBrand: 'discover',
    paymentMethodLast4: '6011',
    amount: '$79.00',
    payment: createFakePayment(
      'fake-payment-6',
      PaymentStatus.Processing,
      true
    ),
  },
  {
    id: 'fake-payment-7',
    date: 'Jun 11, 2024',
    status: 'paid' as const,
    paymentMethodBrand: undefined,
    paymentMethodLast4: '8765',
    amount: '$199.99',
    payment: createFakePayment(
      'fake-payment-7',
      PaymentStatus.Succeeded,
      false
    ),
  },
]
// Set this to true to use fake data for testing
const USE_FAKE_DATA = true

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
  onClick: () => void
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
  const router = useRouter()

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

  const handlePaymentClick = (paymentId: string) => {
    router.push(`/finance/payments/${paymentId}`)
  }

  // Get the customer's first name for the link text
  const customerFirstName = customerName.split(' ')[0]

  return (
    <ExpandSection title="Billing History" defaultExpanded={false}>
      <div className="flex flex-col gap-0 w-full">
        {isLoading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">
            Loading billing history...
          </div>
        ) : (USE_FAKE_DATA
            ? FAKE_BILLING_HISTORY_DATA
            : billingHistoryItems
          ).length === 0 ? (
          <div className="flex gap-3 items-start bg-accent rounded-sm px-4 py-3">
            <div className="pt-0.5 shrink-0">
              <CircleAlert className="size-4 text-foreground" />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                No billing history yet
              </p>
              <p className="text-sm text-muted-foreground">
                {customerName} hasn't made any payments for this
                subscription yet.
              </p>
              <Link
                href={`/customers/${customerId}?tab=payments`}
                className="flex items-center text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                View All Payments for {customerFirstName}
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </div>
        ) : (
          (USE_FAKE_DATA
            ? FAKE_BILLING_HISTORY_DATA
            : billingHistoryItems
          ).map((item) => (
            <BillingHistoryItem
              key={item.id}
              item={item}
              onClick={() => handlePaymentClick(item.id)}
            />
          ))
        )}
      </div>
    </ExpandSection>
  )
}
