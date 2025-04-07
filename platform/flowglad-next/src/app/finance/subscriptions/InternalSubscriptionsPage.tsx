'use client'

import { PageHeader } from '@/components/ion/PageHeader'
import { Subscription } from '@/db/schema/subscriptions'
import SubscriptionsTable from './SubscriptionsTable'
import { SubscriptionStatus } from '@/types'

interface InternalSubscriptionsPageProps {
  subscriptions: Subscription.TableRowData[]
}

export default function InternalSubscriptionsPage({
  subscriptions,
}: InternalSubscriptionsPageProps) {
  return (
    <div className="h-full flex justify-between items-center gap-2.5">
      <div className="bg-background flex-1 h-full w-full flex gap-6 p-6 pb-10">
        <div className="flex-1 h-full w-full flex flex-col">
          <PageHeader
            title="Subscriptions"
            tabs={[
              {
                label: 'All',
                subPath: 'all',
                Component: () => (
                  <SubscriptionsTable data={subscriptions} />
                ),
              },
              {
                label: 'Canceled',
                subPath: 'canceled',
                Component: () => (
                  <SubscriptionsTable
                    data={subscriptions.filter(
                      (subscription) =>
                        subscription.subscription.status ===
                        SubscriptionStatus.Canceled
                    )}
                  />
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
