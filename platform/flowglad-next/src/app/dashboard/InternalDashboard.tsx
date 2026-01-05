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

const ChartDivider = () => {
  return (
    <div className="w-full border-t border-dashed border-border" />
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
        className="pb-2"
        description={
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
        }
      />
      <div className="w-full flex flex-col gap-6 pt-4 pb-16">
        <ChartContainer>
          <RevenueChart fromDate={range.from} toDate={range.to} />
        </ChartContainer>
        <ChartDivider />
        <ChartContainer>
          <DateRangeRecurringRevenueChart
            organizationCreatedAt={organizationCreatedAt}
            fromDate={range.from}
            toDate={range.to}
          />
        </ChartContainer>
        <ChartDivider />
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
