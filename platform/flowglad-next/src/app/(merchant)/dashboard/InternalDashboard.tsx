'use client'

import { RevenueChartIntervalUnit } from '@db-core/enums'
import { endOfDay, startOfDay, subMonths } from 'date-fns'
import { useEffect, useState } from 'react'
import { ChartDivider, ChartGrid } from '@/components/charts'
import { DashboardChart } from '@/components/DashboardChart'
import PageContainer from '@/components/PageContainer'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { IntervalPicker } from '@/components/ui/interval-picker'
import { PageHeaderNew } from '@/components/ui/page-header-new'
import { ProductPicker } from '@/components/ui/product-picker'
import { useAuthContext } from '@/contexts/authContext'
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
  const todayEnd = endOfDay(new Date())
  const [range, setRange] = useState<{
    from: Date
    to: Date
  }>({
    from: subMonths(today, 12),
    to: todayEnd,
  })

  // Global interval state for all charts
  const [interval, setInterval] = useState<RevenueChartIntervalUnit>(
    () => getIntervalConfig(range.from, range.to).default
  )

  // Product filter state (local only, not persisted to URL)
  const [productId, setProductId] = useState<string | null>(null)

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
          <div className="-ml-4 flex items-center">
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
            <ProductPicker
              value={productId}
              onValueChange={setProductId}
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
        {/* Primary Chart - Full Size with metric selector */}
        <div className="py-6">
          <DashboardChart
            fromDate={range.from}
            toDate={range.to}
            interval={interval}
            productId={productId}
            size="lg"
            availableMetrics={['revenue', 'mrr', 'subscribers']}
            defaultMetric="revenue"
          />
        </div>

        <ChartDivider />

        {/* Secondary Charts - Compact Grid with metric selectors */}
        <ChartGrid>
          <DashboardChart
            fromDate={range.from}
            toDate={range.to}
            interval={interval}
            productId={productId}
            size="sm"
            availableMetrics={['mrr', 'subscribers']}
            defaultMetric="mrr"
          />
          <DashboardChart
            fromDate={range.from}
            toDate={range.to}
            interval={interval}
            productId={productId}
            size="sm"
            availableMetrics={['subscribers', 'mrr']}
            defaultMetric="subscribers"
          />
        </ChartGrid>
      </div>
    </PageContainer>
  )
}

export default InternalDashboardPage
