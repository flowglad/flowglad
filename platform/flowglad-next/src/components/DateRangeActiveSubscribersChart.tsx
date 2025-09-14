import { useState } from 'react'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { ActiveSubscribersChart } from './ActiveSubscribersChart'

const DateRangeActiveSubscribersChart = ({
  organizationCreatedAt,
  alignDatePicker = 'left',
  productId,
}: {
  organizationCreatedAt: Date
  alignDatePicker?: 'left' | 'right'
  productId?: string
}) => {
  const defaultFromDate = new Date(organizationCreatedAt)
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
          minDate={new Date(organizationCreatedAt)}
          maxDate={new Date()}
          onSelect={(range) => {
            setRange({
              from: range?.from ?? defaultFromDate,
              to: range?.to ?? new Date(),
            })
          }}
        />
      </div>
      <ActiveSubscribersChart
        fromDate={range.from}
        toDate={range.to}
        productId={productId}
      />
    </>
  )
}

export default DateRangeActiveSubscribersChart
