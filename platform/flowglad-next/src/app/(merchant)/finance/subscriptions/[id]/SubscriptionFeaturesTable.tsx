'use client'

import {
  FeatureType,
  FeatureUsageGrantFrequency,
} from '@db-core/enums'
import type { SubscriptionItemFeature } from '@db-core/schema/subscriptionItemFeatures'
import type { ReactNode } from 'react'
import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
  [FeatureType.Toggle]: 'Toggle',
  [FeatureType.UsageCreditGrant]: 'Usage credit grant',
  [FeatureType.Resource]: 'Resource',
}

const FEATURE_RENEWAL_LABELS: Record<
  FeatureUsageGrantFrequency,
  string
> = {
  [FeatureUsageGrantFrequency.Once]: 'One time',
  [FeatureUsageGrantFrequency.EveryBillingPeriod]:
    'Every billing period',
}

interface SubscriptionFeaturesTableProps {
  featureItems?: SubscriptionItemFeature.ClientRecord[]
  title?: string
  className?: string
  toolbarContent?: ReactNode
}

export const SubscriptionFeaturesTable = ({
  featureItems = [],
  title = 'Features',
  className,
  toolbarContent,
}: SubscriptionFeaturesTableProps) => {
  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between pt-4 pb-3 gap-4 min-w-0">
        <div className="flex items-center gap-4 min-w-0 flex-shrink overflow-hidden">
          <h3 className="text-lg truncate">{title}</h3>
        </div>
        {toolbarContent}
      </div>
      <Table className="w-full" style={{ tableLayout: 'fixed' }}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Renewal Frequency</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {featureItems.length ? (
            featureItems.map((feature) => {
              const featureName = feature.name
              const featureSlug = feature.slug

              return (
                <TableRow key={feature.id}>
                  <TableCell className="truncate">
                    {featureName}
                  </TableCell>
                  <TableCell>
                    <CopyableTextTableCell copyText={featureSlug}>
                      {featureSlug}
                    </CopyableTextTableCell>
                  </TableCell>
                  <TableCell className="capitalize">
                    {FEATURE_TYPE_LABELS[feature.type]}
                  </TableCell>
                  <TableCell>
                    {feature.type === FeatureType.Toggle
                      ? '-'
                      : feature.amount}
                  </TableCell>
                  <TableCell>
                    {feature.type === FeatureType.UsageCreditGrant
                      ? FEATURE_RENEWAL_LABELS[
                          feature.renewalFrequency
                        ]
                      : '-'}
                  </TableCell>
                </TableRow>
              )
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={5}
                className="h-24 text-center text-muted-foreground"
              >
                No features granted.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
