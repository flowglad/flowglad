'use client'
import { useState } from 'react'
import DateRangeActiveSubscribersChart from '@/components/DateRangeActiveSubscribersChart'
import DateRangeRecurringRevenueChart from '@/components/DateRangeRecurringRevenueChart'
import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import { RevenueChart } from '@/components/RevenueChart'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { useAuthContext } from '@/contexts/authContext'

const ChartContainer = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <div className="w-full relative flex flex-col">{children}</div>
  )
}
export interface DashboardPageProps {
  organizationCreatedAt: Date
}

function InternalDashboardPage({
  organizationCreatedAt,
}: DashboardPageProps) {
  const { user } = useAuthContext()
  const firstName = user?.name?.split(' ')[0]
  const greeting = firstName
    ? `Hello, ${firstName}`
    : 'Hello there :)'
  const [range, setRange] = useState<{
    from: Date
    to: Date
  }>({
    from: new Date(organizationCreatedAt),
    to: new Date(),
  })
  return (
    <InnerPageContainerNew>
      <PageHeaderNew
        title={greeting}
        hideBorder
        description={
          <DateRangePicker
            fromDate={range.from}
            toDate={range.to}
            minDate={new Date(organizationCreatedAt)}
            maxDate={new Date()}
            onSelect={(newRange) => {
              if (newRange) {
                setRange({
                  from:
                    newRange.from ?? new Date(organizationCreatedAt),
                  to: newRange.to ?? new Date(),
                })
              }
            }}
          />
        }
      />
      <div className="w-full flex flex-col gap-12 py-4 px-4">
        <ChartContainer>
          <RevenueChart fromDate={range.from} toDate={range.to} />
        </ChartContainer>
        <ChartContainer>
          <DateRangeRecurringRevenueChart
            organizationCreatedAt={organizationCreatedAt}
            fromDate={range.from}
            toDate={range.to}
          />
        </ChartContainer>
        <ChartContainer>
          <DateRangeActiveSubscribersChart
            organizationCreatedAt={organizationCreatedAt}
            fromDate={range.from}
            toDate={range.to}
          />
        </ChartContainer>
      </div>
    </InnerPageContainerNew>
  )
}

export default InternalDashboardPage
