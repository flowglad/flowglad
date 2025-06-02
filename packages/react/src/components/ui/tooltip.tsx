import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { useFlowgladTheme } from '../../FlowgladTheme'

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipProvider>
  )
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      {...props}
    />
  )
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const { themedCn } = useFlowgladTheme()
  return (
    <div className={themedCn()}>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          data-slot="tooltip-content"
          sideOffset={sideOffset}
          className={themedCn(
            'flowglad-bg-primary flowglad-text-primary-foreground flowglad-animate-in flowglad-fade-in-0 flowglad-zoom-in-95 data-[state=closed]:flowglad-animate-out data-[state=closed]:flowglad-fade-out-0 data-[state=closed]:flowglad-zoom-out-95 data-[side=bottom]:flowglad-slide-in-from-top-2 data-[side=left]:flowglad-slide-in-from-right-2 data-[side=right]:flowglad-slide-in-from-left-2 data-[side=top]:flowglad-slide-in-from-bottom-2 flowglad-z-50 flowglad-w-fit flowglad-rounded-md flowglad-px-3 flowglad-py-1 flowglad-text-xs flowglad-text-balance',
            className
          )}
          {...props}
        >
          {children}
          {/* <TooltipPrimitive.Arrow className="flowglad-bg-primary flowglad-fill-primary flowglad-z-50 flowglad-size-2.5 flowglad-translate-y-[calc(-50%_-_2px)] flowglad-rotate-45 flowglad-rounded-[2px]" /> */}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </div>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
