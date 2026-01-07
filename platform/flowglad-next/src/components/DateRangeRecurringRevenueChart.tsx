import { useState } from 'react'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { RevenueChartIntervalUnit } from '@/types'
import { RecurringRevenueChart } from './RecurringRevenueChart'

const DateRangeRecurringRevenueChart = ({
  organizationCreatedAt,
  alignDatePicker = 'left',
  productId,
  fromDate,
  toDate,
  interval,
}: {
  organizationCreatedAt: Date
  alignDatePicker?: 'left' | 'right'
  productId?: string
  fromDate?: Date
  toDate?: Date
  interval?: RevenueChartIntervalUnit
}) => {
  const [range, setRange] = useState<{
    from: Date
    to: Date
  }>({
    from: fromDate ?? new Date(organizationCreatedAt),
    to: toDate ?? new Date(),
  })
  const showDateRangePicker = !fromDate || !toDate

  // Use props when available, otherwise use internal state
  const effectiveFromDate = fromDate ?? range.from
  const effectiveToDate = toDate ?? range.to

  return (
    <>
      <div
        className={`flex ${
          alignDatePicker === 'right' ? 'justify-end' : ''
        }`}
      >
        {showDateRangePicker && (
          <DateRangePicker
            fromDate={range.from}
            toDate={range.to}
            maxDate={new Date()}
            onSelect={(newRange) => {
              if (newRange?.from && newRange?.to) {
                setRange({ from: newRange.from, to: newRange.to })
              }
            }}
          />
        )}
      </div>
      <RecurringRevenueChart
        fromDate={effectiveFromDate}
        toDate={effectiveToDate}
        productId={productId}
        interval={interval}
      />
    </>
  )
}

export default DateRangeRecurringRevenueChart
