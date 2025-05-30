import { Product } from '@flowglad/types'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip'

import { Check, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { useFlowgladTheme } from '../FlowgladTheme'

interface FeatureListProps {
  features: NonNullable<Product['displayFeatures']>
}

export function FeatureLabel({
  feature,
  className,
  popoverClassName,
}: {
  feature: NonNullable<Product['displayFeatures']>[number]
  className?: string
  popoverClassName?: string
}) {
  if (feature.details) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'flowglad-text-sm flowglad-cursor-pointer flowglad-underline flowglad-decoration-dotted',
                className
              )}
            >
              {feature.label}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <div className={cn('flowglad-text-sm', popoverClassName)}>
              {feature.details}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  return (
    <span className={cn('flowglad-text-sm', className)}>
      {feature.label}
    </span>
  )
}

export function FeatureItem({
  feature,
}: {
  feature: NonNullable<Product['displayFeatures']>[number]
}) {
  return (
    <div className="flowglad-flex flowglad-items-center flowglad-gap-2">
      <div
        className={cn(
          'flowglad-rounded-full flowglad-p-0.5',
          feature.enabled
            ? 'flowglad-bg-primary'
            : 'flowglad-bg-muted'
        )}
      >
        {feature.enabled ? (
          <Check className="flowglad-h-3 flowglad-w-3 flowglad-text-primary-foreground" />
        ) : (
          <X className="flowglad-h-3 flowglad-w-3 flowglad-text-primary-foreground" />
        )}
      </div>
      <div className="flowglad-flex flowglad-flex-col flowglad-gap-1">
        <FeatureLabel feature={feature} />
      </div>
    </div>
  )
}

export function FeatureList({ features }: FeatureListProps) {
  const { themedCn } = useFlowgladTheme()

  return (
    <div className={themedCn('flowglad-space-y-3')}>
      {features.map((feature, index) => (
        <FeatureItem key={index} feature={feature} />
      ))}
    </div>
  )
}
