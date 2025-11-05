'use client'
import { useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import DateRangeRevenueChart from '@/components/DateRangeRevenueChart'
import DateRangeRecurringRevenueChart from '@/components/DateRangeRecurringRevenueChart'
import DateRangeActiveSubscribersChart from '@/components/DateRangeActiveSubscribersChart'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'
import { RevenueChart } from '@/components/RevenueChart'

const ChartContainer = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <div className="bg-card w-full relative flex flex-col p-8 rounded border">
      {children}
    </div>
  )
}
export interface DashboardPageProps {
  organizationCreatedAt: Date
}

function InternalDashboardPage({
  organizationCreatedAt,
}: DashboardPageProps) {
  const [range, setRange] = useState<{
    from: Date
    to: Date
  }>({
    from: new Date(organizationCreatedAt),
    to: new Date(),
  })
  return (
    <InternalPageContainer>
      <div className="w-full relative flex flex-col justify-center gap-8 pb-6">
        <Breadcrumb />
        <div className="flex flex-row justify-between">
          <PageHeader title="Dashboard" />
        </div>
        {/* Dashboard Analytics Container - wraps date picker and charts */}
        <div className="w-full flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <DateRangePicker
              fromDate={range.from}
              toDate={range.to}
              minDate={new Date(organizationCreatedAt)}
              maxDate={new Date()}
              onSelect={(newRange) => {
                if (newRange) {
                  setRange({
                    from:
                      newRange.from ??
                      new Date(organizationCreatedAt),
                    to: newRange.to ?? new Date(),
                  })
                }
              }}
            />
          </div>
          <div className="grid grid-cols-1 gap-6">
            <ChartContainer>
              <RevenueChart fromDate={range.from} toDate={range.to} />
            </ChartContainer>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          </div>
        </div>
      </div>
    </InternalPageContainer>
  )
}

export default InternalDashboardPage
