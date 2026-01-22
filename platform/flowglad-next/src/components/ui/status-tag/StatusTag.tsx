'use client'

import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { StatusConfig } from './types'
import { variantStyles } from './variants'

export interface StatusTagProps<T extends string> {
  /** The status value to display */
  status: T
  /** Configuration object mapping status values to display properties */
  config: StatusConfig<T>
  /** Whether to show tooltip on hover. Requires TooltipProvider in parent tree. */
  showTooltip?: boolean
  /** Override the tooltip text from config */
  tooltip?: string
  /** Tooltip visual variant: 'default' (dark) or 'muted' (light with border) */
  tooltipVariant?: 'default' | 'muted'
  /** Override whether to show icon. Defaults to true if config has icon. */
  showIcon?: boolean
  /** Override the label text from config */
  label?: string
  /** Additional CSS classes */
  className?: string
  /** Badge size variant */
  size?: 'sm' | 'md'
}

/**
 * A type-safe status badge component that renders status values with
 * consistent styling, icons, and optional tooltips.
 *
 * @requires TooltipProvider - When using showTooltip, a TooltipProvider must
 * exist in the component tree (typically at the page layout level).
 * Do NOT nest TooltipProviders.
 *
 * @example
 * // Basic usage with wrapper
 * <SubscriptionStatusTag status={subscription.status} />
 *
 * // With tooltip (requires TooltipProvider in parent)
 * <SubscriptionStatusTag status={subscription.status} showTooltip />
 *
 * // With explicit config
 * <StatusTag status={status} config={subscriptionStatusConfig} />
 */
export function StatusTag<T extends string>({
  status,
  config,
  showTooltip = false,
  tooltip,
  tooltipVariant = 'default',
  showIcon,
  label,
  className,
  size = 'md',
}: StatusTagProps<T>) {
  const statusConfig = config[status]

  // Fail fast in development, graceful fallback in production
  if (!statusConfig) {
    if (process.env.NODE_ENV === 'development') {
      throw new Error(
        `[StatusTag] Missing config for status: "${status}". ` +
          `Ensure all enum values are defined in the config object.`
      )
    }
    return (
      <Badge
        variant="outline"
        role="status"
        aria-label="Unknown status"
      >
        Unknown
      </Badge>
    )
  }

  const {
    label: defaultLabel,
    variant,
    icon: Icon,
    tooltip: defaultTooltip,
  } = statusConfig

  const displayLabel = label ?? defaultLabel
  const displayTooltip = tooltip ?? defaultTooltip
  // Show icon if explicitly enabled, or if not specified and config has icon
  const shouldShowIcon = showIcon !== false && Icon !== undefined

  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs gap-1',
    md: 'px-2.5 py-0.5 text-xs gap-1.5',
  }

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
  }

  const badge = (
    <Badge
      variant="outline"
      role="status"
      aria-label={displayLabel}
      className={cn(
        variantStyles[variant],
        sizeStyles[size],
        // Make focusable for keyboard accessibility when tooltip is shown
        showTooltip &&
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        className
      )}
      // Enable keyboard focus when tooltips are used
      tabIndex={showTooltip ? 0 : undefined}
    >
      {shouldShowIcon && Icon && (
        <span aria-hidden="true">
          <Icon className={cn(iconSizes[size], 'shrink-0')} />
        </span>
      )}
      <span>{displayLabel}</span>
    </Badge>
  )

  if (showTooltip && displayTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent
          side="bottom"
          variant={tooltipVariant}
          className="max-w-xs text-sm px-3 py-2"
        >
          <p>{displayTooltip}</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  return badge
}
