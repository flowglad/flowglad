// Generated with Ion on 10/31/2024, 6:10:56 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=1033:8693
'use client'
import PageTitle from '@/components/ion/PageTitle'
import DateRangeRevenueChart from '@/components/DateRangeRevenueChart'
import DateRangeRecurringRevenueChart from '@/components/DateRangeRecurringRevenueChart'

export interface DashboardPageProps {
  organizationCreatedAt: Date
}

function InternalDashboardPage({
  organizationCreatedAt,
}: DashboardPageProps) {
  /**
   * Not declaring a default toDate, to handle the case where this
   * page is live across a date line (loaded < 12am, but open > 12am).
   */
  return (
    <>
      <div className="bg-internal flex-1 flex items-start gap-6 p-6 h-full w-full overflow-y-scroll">
        <div className="w-full flex flex-col gap-10 rounded-radius-sm">
          <PageTitle>Dashboard</PageTitle>
          <DateRangeRevenueChart
            organizationCreatedAt={organizationCreatedAt}
          />
          <div className="w-full flex flex-col gap-6">
            <DateRangeRecurringRevenueChart
              organizationCreatedAt={organizationCreatedAt}
            />
          </div>
        </div>
      </div>
    </>
  )
}

export default InternalDashboardPage
