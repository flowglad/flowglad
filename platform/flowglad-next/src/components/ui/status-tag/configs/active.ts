import { Check, X } from 'lucide-react'
import type { StatusConfigItem } from '../types'

export type ActiveStatus = 'active' | 'inactive'

export const activeStatusConfig = {
  active: {
    label: 'Active',
    variant: 'success',
    icon: Check,
    tooltip: 'This item is currently active and available for use.',
  },
  inactive: {
    label: 'Inactive',
    variant: 'muted',
    icon: X,
    tooltip: 'This item is inactive and not available for use.',
  },
} satisfies Record<ActiveStatus, StatusConfigItem>

/**
 * Converts a boolean active state to an ActiveStatus string.
 * Useful when working with entities that have a boolean `active` field.
 *
 * @example
 * <ActiveStatusTag status={booleanToActiveStatus(product.active)} />
 */
export function booleanToActiveStatus(active: boolean): ActiveStatus {
  return active ? 'active' : 'inactive'
}
