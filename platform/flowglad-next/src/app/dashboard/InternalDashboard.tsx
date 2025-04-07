// Generated with Ion on 10/31/2024, 6:10:56 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1033:8693
'use client'
import { useState } from 'react'
import PageTitle from '@/components/ion/PageTitle'
import DateRangeRevenueChart from '@/components/DateRangeRevenueChart'
import DateRangeRecurringRevenueChart from '@/components/DateRangeRecurringRevenueChart'
import DateRangeActiveSubscribersChart from '@/components/DateRangeActiveSubscribersChart'
import { DateRangePicker } from '@/components/ion/Datepicker'

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
    <>
      <div className="bg-internal flex-1 flex items-start gap-6 p-6 h-full w-full overflow-y-scroll">
        <div className="w-full flex flex-col gap-10 rounded-radius-sm">
          <div className="flex justify-between items-center">
            <PageTitle>Dashboard</PageTitle>
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
              mode="range"
            />
          </div>
          <div className="grid grid-cols-1 gap-6">
            <div className="bg-nav w-full relative flex flex-col gap-6 p-8 pt-0 rounded-radius-sm border border-stroke-subtle">
              <DateRangeRevenueChart
                organizationCreatedAt={organizationCreatedAt}
                fromDate={range.from}
                toDate={range.to}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-nav w-full relative flex flex-col gap-6 p-8 pt-0 rounded-radius-sm border border-stroke-subtle">
                <DateRangeRecurringRevenueChart
                  organizationCreatedAt={organizationCreatedAt}
                  fromDate={range.from}
                  toDate={range.to}
                />
              </div>
              <div className="bg-nav w-full relative flex flex-col gap-6 p-8 pt-0 rounded-radius-sm border border-stroke-subtle">
                <DateRangeActiveSubscribersChart
                  organizationCreatedAt={organizationCreatedAt}
                  fromDate={range.from}
                  toDate={range.to}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default InternalDashboardPage
