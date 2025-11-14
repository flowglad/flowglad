'use client'

import CopyableTextTableCell from '@/components/CopyableTextTableCell'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SubscriptionItemFeature } from '@/db/schema/subscriptionItemFeatures'
import { FeatureType, FeatureUsageGrantFrequency } from '@/types'
import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
  [FeatureType.Toggle]: 'Toggle',
  [FeatureType.UsageCreditGrant]: 'Usage credit grant',
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
            <TableHead>Renewal Frequency</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {featureItems.length ? (
            featureItems.map((feature) => {
              const featureName =
                'name' in feature ? feature.name : '—'
              const featureSlug =
                'slug' in feature ? feature.slug : feature.featureId

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
                      : FEATURE_RENEWAL_LABELS[
                          feature.renewalFrequency
                        ]}
                  </TableCell>
                </TableRow>
              )
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={4}
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
