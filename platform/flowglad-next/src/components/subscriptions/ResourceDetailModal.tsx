'use client'

import { ChartPie } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'

interface ResourceDetailModalProps {
  resourceSlug: string
  capacity: number
  claimed: number
  available: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const ResourceDetailModal = ({
  resourceSlug,
  capacity,
  claimed,
  available,
  open,
  onOpenChange,
}: ResourceDetailModalProps) => {
  const usagePercentage =
    capacity > 0 ? Math.min((claimed / capacity) * 100, 100) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" allowContentOverflow>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChartPie className="h-5 w-5" />
            {resourceSlug}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Usage Progress */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Usage</span>
              <span className="font-medium">
                {Math.round(usagePercentage)}%
              </span>
            </div>
            <Progress value={usagePercentage} className="h-2" />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col items-center text-center">
              <span className="text-2xl font-semibold">
                {capacity}
              </span>
              <span className="text-xs text-muted-foreground">
                Total Capacity
              </span>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-2xl font-semibold">
                {claimed}
              </span>
              <span className="text-xs text-muted-foreground">
                Claimed
              </span>
            </div>
            <div className="flex flex-col items-center text-center">
              <span className="text-2xl font-semibold">
                {available}
              </span>
              <span className="text-xs text-muted-foreground">
                Available
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
