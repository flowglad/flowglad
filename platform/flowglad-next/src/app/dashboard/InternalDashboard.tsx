// Generated with Ion on 10/31/2024, 6:10:56 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1033:8693
'use client'
import { useState } from 'react'
import PageTitle from '@/components/ion/PageTitle'
import DateRangeRevenueChart from '@/components/DateRangeRevenueChart'
import DateRangeRecurringRevenueChart from '@/components/DateRangeRecurringRevenueChart'
import DateRangeActiveSubscribersChart from '@/components/DateRangeActiveSubscribersChart'
import { DateRangePicker } from '@/components/ion/Datepicker'
import { Dashboard as DashboardIcon } from '@mui/icons-material'
import Button from '@/components/ion/Button'
import { Plus } from 'lucide-react'

const ChartContainer = ({
  children,
}: {
  children: React.ReactNode
}) => {
  return (
    <div className="bg-nav w-full relative flex flex-col gap-6 p-8 pt-0 rounded-radius-sm border border-stroke-subtle">
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
    <>
      <div className="bg-internal flex-1 flex items-start gap-6 p-6 h-full w-full overflow-y-scroll">
        <div className="w-full flex flex-col gap-10 rounded-radius-sm">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <DashboardIcon className="text-foreground" />
              <PageTitle>Dashboard</PageTitle>
            </div>
            <div className="flex items-center gap-4">
              <DateRangePicker
                fromDate={range.from}
                toDate={range.to}
                minDate={new Date(organizationCreatedAt)}
                maxDate={new Date()}
                onSelect={(newRange) => {
                  if (newRange) {
                    setRange({
                      from: newRange.from ?? new Date(organizationCreatedAt),
                      to: newRange.to ?? new Date(),
                    })
                  }
                }}
                mode="range"
              />
              <Button
                iconLeading={<Plus size={16} />}
                variant="filled"
                color="primary"
              >
                Create Product
              </Button>
            </div>
          </div>

          <div className="flex gap-2 border-b border-stroke pb-2">
            <Button
              variant="ghost"
              color="primary"
              className="!text-foreground"
            >
              Payments
            </Button>
            <Button
              variant="ghost"
              color="primary"
              className="!text-subtle"
            >
              Billing
            </Button>
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
      </div>
    </>
  )
}

export default InternalDashboardPage