import type { ReactNode } from 'react'
import type { StatusConfig, StatusVariant } from '../types'

/** PageHeaderNew badge variant (different from StatusTag variant) */
type PageHeaderVariant =
  | 'active'
  | 'muted'
  | 'destructive'
  | 'warning'

/** PageHeaderNew StatusBadge interface */
interface PageHeaderStatusBadge {
  icon?: ReactNode
  label: ReactNode
  variant?: PageHeaderVariant
  tooltip?: string
}

/**
 * Maps StatusTag variants to PageHeaderNew variants.
 *
 * StatusTag uses semantic names (success, info) while PageHeaderNew
 * uses state names (active). This mapping bridges the two systems.
 */
const variantMapping: Record<StatusVariant, PageHeaderVariant> = {
  success: 'active', // green → active
  warning: 'warning', // yellow → warning
  destructive: 'destructive', // red → destructive
  info: 'muted', // blue → muted (PageHeaderNew has no info variant)
  muted: 'muted', // gray → muted
}

interface StatusConfigToPageHeaderBadgeOptions {
  /** Override whether to show the icon. Defaults to true if config has icon. */
  showIcon?: boolean
}

/**
 * Converts a status and its config to a PageHeaderNew-compatible badge object.
 *
 * @example
 * import { statusConfigToPageHeaderBadge, subscriptionStatusConfig } from '@/components/ui/status-tag'
 *
 * <PageHeaderNew
 *   title="Subscription Details"
 *   badges={[
 *     statusConfigToPageHeaderBadge(subscription.status, subscriptionStatusConfig)
 *   ]}
 * />
 *
 * @param status - The status value to convert
 * @param config - The status configuration object
 * @param options - Optional configuration for the conversion
 * @returns A PageHeaderNew-compatible badge object
 */
export function statusConfigToPageHeaderBadge<T extends string>(
  status: T,
  config: StatusConfig<T>,
  options?: StatusConfigToPageHeaderBadgeOptions
): PageHeaderStatusBadge {
  const statusConfig = config[status]

  if (!statusConfig) {
    return { label: 'Unknown', variant: 'muted' }
  }

  const { label, variant, icon: Icon, tooltip } = statusConfig
  const showIcon = options?.showIcon !== false && Icon !== undefined

  return {
    label,
    variant: variantMapping[variant],
    tooltip,
    icon:
      showIcon && Icon ? <Icon className="h-3.5 w-3.5" /> : undefined,
  }
}
