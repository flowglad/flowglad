'use client'

import { PageHeader } from '@/components/ion/PageHeader'
import { Subscription } from '@/db/schema/subscriptions'
import SubscriptionsTable from './SubscriptionsTable'
import { SubscriptionStatus } from '@/types'
import InternalPageContainer from '@/components/InternalPageContainer'

interface InternalSubscriptionsPageProps {
  subscriptions: Subscription.TableRowData[]
}

export default function InternalSubscriptionsPage({
  subscriptions,
}: InternalSubscriptionsPageProps) {
  return (
    <InternalPageContainer>
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
    </InternalPageContainer>
  )
}
