import * as React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const DisabledTooltip = ({ 
  message, 
  children 
}: { 
  message: string
  children?: React.ReactNode 
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {children || <div className="absolute inset-0" />}
      </TooltipTrigger>
      <TooltipContent 
        side="top" 
        className="bg-black/75 text-white text-xs rounded whitespace-nowrap z-[60]"
      >
        {message}
      </TooltipContent>
    </Tooltip>
  )
}

export default DisabledTooltip 