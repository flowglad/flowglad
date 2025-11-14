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
import { FeatureType } from '@/types'
import { cn } from '@/lib/utils'

const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
  [FeatureType.Toggle]: 'Toggle',
  [FeatureType.UsageCreditGrant]: 'Usage credit grant',
}

interface SubscriptionFeaturesTableProps {
  featureItems?: SubscriptionItemFeature.ClientRecord[]
  title?: string
  className?: string
}

export const SubscriptionFeaturesTable = ({
  featureItems = [],
  title = 'Features',
  className,
}: SubscriptionFeaturesTableProps) => {
  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between pt-4 pb-3 gap-4 min-w-0">
        <div className="flex items-center gap-4 min-w-0 flex-shrink overflow-hidden">
          <h3 className="text-lg truncate">{title}</h3>
        </div>
      </div>
      <Table className="w-full" style={{ tableLayout: 'fixed' }}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Type</TableHead>
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
                </TableRow>
              )
            })
          ) : (
            <TableRow>
              <TableCell
                colSpan={3}
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
