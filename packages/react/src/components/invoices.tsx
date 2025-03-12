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
          'bg-red-100 text-red-700 border-red-200 gap-1',
          className
        )}
      >
        Past Due
        <Clock className="w-4 h-4" strokeWidth={2.5} />
      </Badge>
    )
  }
  return (
    <Badge
      variant="secondary"
      className={cn(
        'bg-yellow-100 text-yellow-700 border-yellow-200',
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
            'bg-green-100 text-green-700 border-green-200 w-fit gap-1',
            className
          )}
        >
          Paid
          <Check className="w-4 h-4" strokeWidth={2.5} />
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
            className={cn({
              'cursor-pointer': !!onClickInvoice,
            })}
          >
            <TableCell className="font-medium text-muted-foreground w-32">
              {formatDate(invoice.createdAt)}
            </TableCell>
            <TableCell className="font-medium w-32">
              {humanReadableCurrencyAmount(
                invoice.currency,
                totalAmountForInvoice(invoice)
              )}
            </TableCell>
            <TableCell className="flex justify-end">
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
