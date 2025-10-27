import { CustomerTableRowData } from '@/db/schema/customers'
import { titleCase } from '@/utils/core'
import { stripeCurrencyAmountToHumanReadableCurrencyAmount } from '@/utils/stripe'
import { CurrencyCode } from '@/types'
import { format } from 'date-fns'

const CSV_HEADERS = [
  'Name',
  'Email',
  'Total Spend',
  'Payments',
  'Created Date',
  'Customer ID',
  'External ID',
  'Status',
] as const

const escapeCsvValue = (
  value: string | number | null | undefined
) => {
  if (value === null || value === undefined) {
    return '""'
  }
  const stringValue = String(value)
  const escaped = stringValue.replace(/"/g, '""')
  return `"${escaped}"`
}

const formatCurrency = (
  amount: number | undefined,
  currency: CurrencyCode = CurrencyCode.USD
) => {
  const safeAmount = Number(amount ?? 0)
  return stripeCurrencyAmountToHumanReadableCurrencyAmount(
    currency,
    safeAmount
  )
}

const formatDate = (date: Date | string | number | undefined) => {
  if (!date) {
    return ''
  }
  // Use consistent yyyy-MM-dd format for CSV exports (same as filename format)
  return format(new Date(date), 'yyyy-MM-dd')
}

const formatTimestampedFilename = (prefix: string, date: Date) => {
  const timestamp = format(date, 'yyyy-MM-dd')
  return `${prefix}_${timestamp}.csv`
}

export const createCustomersCsv = (
  rows: CustomerTableRowData[],
  currency: CurrencyCode = CurrencyCode.USD,
  now: Date = new Date()
) => {
  const header = CSV_HEADERS.map(escapeCsvValue).join(',')

  const data = rows.map((row) => {
    const fields = [
      row.customer.name,
      row.customer.email,
      formatCurrency(row.totalSpend, currency),
      row.payments ?? 0,
      formatDate(row.customer.createdAt),
      row.customer.id,
      row.customer.externalId,
      titleCase(row.status),
    ]

    return fields.map(escapeCsvValue).join(',')
  })

  const csv = [header, ...data].join('\n')
  const filename = formatTimestampedFilename('customers', now)

  return {
    csv,
    filename,
  }
}
