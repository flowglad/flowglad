import { useState } from 'react'
import { DateRangePicker } from '@/components/ui/date-range-picker'
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

  return (
    <>
      <div
        className={`flex ${
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
      </div>
      <RevenueChart
        fromDate={range.from}
        toDate={range.to}
        productId={productId}
      />
    </>
  )
}

export default DateRangeRevenueChart
