import type { StatusVariant } from './types'

/**
 * Status variant styles using CSS custom properties.
 * All colors auto-switch between light/dark mode via globals.css.
 *
 * Required CSS variables in globals.css:
 * - --status-success-bg, --status-success-fg, --status-success-border
 * - --status-warning-bg, --status-warning-fg, --status-warning-border
 * - --status-destructive-bg, --status-destructive-fg, --status-destructive-border
 * - --status-info-bg, --status-info-fg, --status-info-border
 * - --status-muted-bg, --status-muted-fg, --status-muted-border
 */
export const variantStyles: Record<StatusVariant, string> = {
  success:
    'bg-status-success-bg text-status-success-fg border-status-success-border',
  warning:
    'bg-status-warning-bg text-status-warning-fg border-status-warning-border',
  destructive:
    'bg-status-destructive-bg text-status-destructive-fg border-status-destructive-border',
  info: 'bg-status-info-bg text-status-info-fg border-status-info-border',
  muted:
    'bg-status-muted-bg text-status-muted-fg border-status-muted-border',
}
