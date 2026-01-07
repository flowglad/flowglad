'use client'
import { startOfDay, subMonths } from 'date-fns'
import { useEffect, useState } from 'react'
import { ActiveSubscribersChart } from '@/components/ActiveSubscribersChart'
import InnerPageContainerNew from '@/components/InnerPageContainerNew'
import { RecurringRevenueChart } from '@/components/RecurringRevenueChart'
import { RevenueChart } from '@/components/RevenueChart'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { IntervalPicker } from '@/components/ui/interval-picker'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { useAuthContext } from '@/contexts/authContext'
import { RevenueChartIntervalUnit } from '@/types'
import { getIntervalConfig } from '@/utils/chartIntervalUtils'

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
    const isCurrentIntervalInvalid =
      !config.options.includes(interval)

    if (isCurrentIntervalInvalid) {
      setInterval(config.default)
    }
  }, [range, interval])

  return (
    <InnerPageContainerNew>
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
      <div className="w-full flex flex-col gap-6 pt-4 pb-16">
        <ChartContainer>
          <RevenueChart
            fromDate={range.from}
            toDate={range.to}
            interval={interval}
          />
        </ChartContainer>
        <ChartDivider />
        <ChartContainer>
          <RecurringRevenueChart
            fromDate={range.from}
            toDate={range.to}
            interval={interval}
          />
        </ChartContainer>
        <ChartDivider />
        <ChartContainer>
          <ActiveSubscribersChart
            fromDate={range.from}
            toDate={range.to}
            interval={interval}
          />
        </ChartContainer>
      </div>
    </InnerPageContainerNew>
  )
}

export default InternalDashboardPage
