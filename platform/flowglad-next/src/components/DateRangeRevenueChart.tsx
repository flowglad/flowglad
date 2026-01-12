import { useEffect, useState } from 'react'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { IntervalPicker } from '@/components/ui/interval-picker'
import { RevenueChartIntervalUnit } from '@/types'
import { getIntervalConfig } from '@/utils/chartIntervalUtils'
import { RevenueChart } from './RevenueChart'

const DateRangeRevenueChart = ({
  organizationCreatedAt,
  alignDatePicker = 'left',
  productId,
}: {
  organizationCreatedAt: Date
  alignDatePicker?: 'left' | 'right'
  productId?: string
}) => {
  const [range, setRange] = useState<{
    from: Date
    to: Date
  }>({
    from: new Date(organizationCreatedAt),
    to: new Date(),
  })

  const [interval, setInterval] = useState<RevenueChartIntervalUnit>(
    () => getIntervalConfig(range.from, range.to).default
  )

  // Auto-correct interval when date range changes if it becomes invalid
  useEffect(() => {
    const config = getIntervalConfig(range.from, range.to)
    if (!config.options.includes(interval)) {
      setInterval(config.default)
    }
  }, [range, interval])

  return (
    <>
      <div
        className={`flex gap-2 ${
          alignDatePicker === 'right' ? 'justify-end' : ''
        }`}
      >
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
        <IntervalPicker
          value={interval}
          onValueChange={setInterval}
          fromDate={range.from}
          toDate={range.to}
        />
      </div>
      <RevenueChart
        fromDate={range.from}
        toDate={range.to}
        productId={productId}
        interval={interval}
      />
    </>
  )
}

export default DateRangeRevenueChart
