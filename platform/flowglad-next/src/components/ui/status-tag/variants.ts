import type { StatusVariant } from './types'

/**
 * Status variant styles using CSS custom properties.
 * All colors auto-switch between light/dark mode via globals.css.
 *
 * Required CSS variables in globals.css:
 * - --jade-background, --jade-foreground, --jade-border (success)
 * - --citrine-background, --citrine-foreground, --citrine-border (warning)
 * - --status-destructive-bg, --status-destructive-fg, --status-destructive-border
 * - --lapis-background, --lapis-foreground, --lapis-border (info)
 * - --status-muted-bg, --status-muted-fg, --status-muted-border
 * - --amethyst-background, --amethyst-foreground, --amethyst-border (amethyst)
 */
export const variantStyles: Record<StatusVariant, string> = {
  success:
    'bg-jade-background text-jade-foreground border-jade-border',
  warning:
    'bg-citrine-background text-citrine-foreground border-citrine-border',
  destructive:
    'bg-status-destructive-bg text-status-destructive-fg border-status-destructive-border',
  info: 'bg-lapis-background text-lapis-foreground border-lapis-border',
  muted:
    'bg-status-muted-bg text-status-muted-fg border-status-muted-border',
  amethyst:
    'bg-amethyst-background text-amethyst-foreground border-amethyst-border',
}
