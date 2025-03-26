import { Table, TableBody, TableCell, TableRow } from './ui/table'
import { Badge } from './ui/badge'
import {
  cn,
  formatDate,
  humanReadableCurrencyAmount,
} from '../lib/utils'
import {
  Invoice,
  InvoiceLineItem,
  InvoiceStatus,
} from '@flowglad/types'
import { Check, Clock } from 'lucide-react'

type InvoiceWithLineItems = Pick<
  Invoice,
  'createdAt' | 'currency' | 'status' | 'dueDate' | 'id'
> & {
  lineItems: Pick<
    InvoiceLineItem,
    'description' | 'quantity' | 'price'
  >[]
}

interface InvoicesProps {
  invoices: InvoiceWithLineItems[]
}

const totalAmountForInvoice = (invoice: InvoiceWithLineItems) => {
  return invoice.lineItems.reduce((acc, lineItem) => {
    return acc + lineItem.quantity * lineItem.price
  }, 0)
}

function OpenInvoiceStatusBadge({
  dueDate,
  className,
}: {
  dueDate?: string | Date | null
  className?: string
}) {
  if (dueDate && new Date(dueDate) < new Date()) {
    return (
      <Badge
        variant="secondary"
        className={cn(
          '!flowglad-bg-red-100 !flowglad-text-red-700 !flowglad-border-red-200 flowglad-gap-1',
          className
        )}
      >
        Past Due
        <Clock
          className="flowglad-w-4 flowglad-h-4"
          strokeWidth={2.5}
        />
      </Badge>
    )
  }
  return (
    <Badge
      variant="secondary"
      className={cn(
        '!flowglad-bg-yellow-100 !flowglad-text-yellow-700 !flowglad-border-yellow-200',
        className
      )}
    >
      Open
    </Badge>
  )
}

export function InvoiceStatusBadge({
  status,
  dueDate,
  className,
}: {
  status: InvoiceStatus
  dueDate?: string | Date | null
  className?: string
}) {
  switch (status) {
    case 'open':
      return (
        <OpenInvoiceStatusBadge
          dueDate={dueDate}
          className={className}
        />
      )
    case 'paid':
      return (
        <Badge
          variant="secondary"
          className={cn(
            '!flowglad-bg-green-100 !flowglad-text-green-700 !flowglad-border-green-200 flowglad-w-fit flowglad-gap-1',
            className
          )}
        >
          Paid
          <Check
            className="flowglad-w-4 flowglad-h-4"
            strokeWidth={2.5}
          />
        </Badge>
      )
  }
}

export function Invoices({
  invoices,
  onClickInvoice,
}: InvoicesProps & {
  onClickInvoice?: (invoice: InvoiceWithLineItems) => void
}) {
  return (
    <Table>
      <TableBody>
        {invoices.map((invoice, index) => (
          <TableRow
            key={index}
            onClick={() => {
              if (!onClickInvoice) {
                return
              }
              onClickInvoice(invoice)
            }}
            className={cn('!flowglad-border-x-0', {
              'flowglad-cursor-pointer': !!onClickInvoice,
            })}
          >
            <TableCell className="flowglad-font-medium flowglad-text-muted-foreground flowglad-w-32 flowglad-pl-0">
              {formatDate(invoice.createdAt)}
            </TableCell>
            <TableCell className="flowglad-font-medium flowglad-w-32">
              {humanReadableCurrencyAmount(
                invoice.currency,
                totalAmountForInvoice(invoice)
              )}
            </TableCell>
            <TableCell className="flowglad-flex flowglad-justify-end">
              <InvoiceStatusBadge
                status={invoice.status}
                dueDate={invoice.dueDate}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
