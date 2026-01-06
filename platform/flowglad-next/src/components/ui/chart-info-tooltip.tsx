'use client'

import { Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ChartInfoTooltipProps {
  content: string
}

/**
 * A reusable info icon with tooltip for chart explanations.
 * Provides on-demand help without cluttering the UI.
 */
export function ChartInfoTooltip({ content }: ChartInfoTooltipProps) {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="ml-1 inline-flex items-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="More information"
          >
            <Info className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-sm">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
