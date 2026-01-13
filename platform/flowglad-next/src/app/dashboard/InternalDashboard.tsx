'use client'

import { startOfDay, subMonths } from 'date-fns'
import { useEffect, useState } from 'react'
import { ActiveSubscribersChart } from '@/components/ActiveSubscribersChart'
import { ChartDivider, ChartGrid } from '@/components/charts'
import PageContainer from '@/components/PageContainer'
import { RecurringRevenueChart } from '@/components/RecurringRevenueChart'
import { RevenueChart } from '@/components/RevenueChart'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { IntervalPicker } from '@/components/ui/interval-picker'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { useAuthContext } from '@/contexts/authContext'
import { RevenueChartIntervalUnit } from '@/types'
import { getIntervalConfig } from '@/utils/chartIntervalUtils'

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
  const today = startOfDay(new Date())
  const [range, setRange] = useState<{
    from: Date
    to: Date
  }>({
    from: subMonths(today, 12),
    to: today,
  })

  // Global interval state for all charts
  const [interval, setInterval] = useState<RevenueChartIntervalUnit>(
    () => getIntervalConfig(range.from, range.to).default
  )

  // Auto-correct interval when date range changes if it becomes invalid
  useEffect(() => {
    const config = getIntervalConfig(range.from, range.to)
    setInterval((prev) =>
      config.options.includes(prev) ? prev : config.default
    )
  }, [range.from, range.to])

  return (
    <PageContainer>
      <PageHeaderNew
        title={greeting}
        className="pb-2"
        description={
          <div className="flex items-center gap-2">
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
        }
      />
      {/* 
        Content container uses edge-to-edge divider pattern:
        - NO gap between items
        - Padding on individual sections for spacing
        - Allows ChartDivider to span full width while content is inset
      */}
      <div className="w-full flex flex-col pb-16">
        {/* Primary Chart - Full Size with bottom padding */}
        <div className="py-6">
          <RevenueChart
            fromDate={range.from}
            toDate={range.to}
            interval={interval}
            size="lg"
          />
        </div>

        <ChartDivider />

        {/* Secondary Charts - Compact Grid with top padding */}
        <ChartGrid>
          <RecurringRevenueChart
            fromDate={range.from}
            toDate={range.to}
            interval={interval}
            size="sm"
          />
          <ActiveSubscribersChart
            fromDate={range.from}
            toDate={range.to}
            interval={interval}
            size="sm"
          />
        </ChartGrid>
      </div>
    </PageContainer>
  )
}

export default InternalDashboardPage
