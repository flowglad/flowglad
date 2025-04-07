import { useState } from 'react'
import { DateRangePicker } from './ion/Datepicker'
import { ActiveSubscribersChart } from './ActiveSubscribersChart'

const DateRangeActiveSubscribersChart = ({
  organizationCreatedAt,
  alignDatePicker = 'left',
  productId,
  fromDate,
  toDate,
}: {
  organizationCreatedAt: Date
  alignDatePicker?: 'left' | 'right'
  productId?: string
  fromDate?: Date
  toDate?: Date
}) => {
  const defaultFromDate = new Date(organizationCreatedAt)
  const [range, setRange] = useState<{
    from: Date
    to: Date
  }>({
    from: fromDate ?? new Date(organizationCreatedAt),
    to: toDate ?? new Date(),
  })
  const showDateRangePicker = !fromDate || !toDate

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
            minDate={new Date(organizationCreatedAt)}
            maxDate={new Date()}
            onSelect={(range) => {
              setRange({
                from: range?.from ?? defaultFromDate,
                to: range?.to ?? new Date(),
              })
            }}
            mode="range"
          />
        )}
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
