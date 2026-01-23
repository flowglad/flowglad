import { Check, X } from 'lucide-react'
import type { StatusConfigItem } from '../types'

export type ActiveStatus = 'active' | 'inactive'

export const activeStatusConfig = {
  active: {
    label: 'Active',
    variant: 'success',
    icon: Check,
    tooltip:
      'Enabled and operational. Will be used in applicable workflows.',
  },
  inactive: {
    label: 'Inactive',
    variant: 'muted',
    icon: X,
    tooltip: 'Disabled. Will not be used until reactivated.',
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
