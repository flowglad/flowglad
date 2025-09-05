// Generated with Ion on 10/31/2024, 6:10:56 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1033:8693
'use client'
import { useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import DateRangeRevenueChart from '@/components/DateRangeRevenueChart'
import DateRangeRecurringRevenueChart from '@/components/DateRangeRecurringRevenueChart'
import DateRangeActiveSubscribersChart from '@/components/DateRangeActiveSubscribersChart'
import { DateRangePicker } from '@/components/date-range-picker'
import InternalPageContainer from '@/components/InternalPageContainer'
import Breadcrumb from '@/components/navigation/Breadcrumb'

const ChartContainer = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <div className="bg-background w-full relative flex flex-col gap-6 p-8 pt-0 rounded-lg-sm border border-muted">
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
                    newRange.from ?? new Date(organizationCreatedAt),
                  to: newRange.to ?? new Date(),
                })
              }
            }}
          />
        </div>
        <div className="grid grid-cols-1 gap-6">
          <ChartContainer>
            <DateRangeRevenueChart
              organizationCreatedAt={organizationCreatedAt}
              fromDate={range.from}
              toDate={range.to}
            />
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
    </InternalPageContainer>
  )
}

export default InternalDashboardPage
