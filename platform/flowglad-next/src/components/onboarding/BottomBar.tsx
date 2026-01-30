// src/components/onboarding/BottomBar.tsx

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface BottomBarProps {
  children: ReactNode
  className?: string
}

/**
 * Layout primitive for a full-width static bottom bar.
 * Flows naturally with document content (not fixed).
 *
 * Uses design tokens:
 * - bg-background: Container background (--background)
 * - border-border: Top border color (--border)
 *
 * Mobile considerations:
 * - Uses pb-[env(safe-area-inset-bottom)] for iOS notch/home indicator
 *
 * Full-bleed border:
 * - Uses a pseudo-element to extend border-t to full viewport width
 * - This allows the bar to sit inside constrained containers while
 *   maintaining a full-width top border
 */
export function BottomBar({ children, className }: BottomBarProps) {
  return (
    <div
      className={cn(
        'w-full relative',
        // Full-width border-t using pseudo-element (extends beyond parent container)
        'before:absolute before:top-0 before:left-1/2 before:-translate-x-1/2 before:w-screen before:border-t before:border-border',
        'pb-[env(safe-area-inset-bottom)]',
        className
      )}
    >
      {children}
    </div>
  )
}

interface FixedBottomBarProps {
  children: ReactNode
  className?: string
}

/**
 * Layout primitive for a full-width fixed bottom bar.
 * Handles positioning and basic styling only.
 *
 * Uses design tokens:
 * - bg-background: Container background (--background)
 * - border-border: Top border color (--border)
 *
 * Mobile considerations:
 * - Uses pb-[env(safe-area-inset-bottom)] for iOS notch/home indicator
 * - Stays visible and moves up when mobile keyboard appears
 */
export function FixedBottomBar({
  children,
  className,
}: FixedBottomBarProps) {
  return (
    <div
      className={cn(
        'fixed left-0 bottom-0 right-0 z-50',
        'border-t border-border',
        'px-6 pb-[env(safe-area-inset-bottom)]',
        className
      )}
    >
      {children}
    </div>
  )
}

interface ResponsiveBottomBarProps {
  children: ReactNode
  className?: string
}

/**
 * Layout primitive for a responsive bottom bar.
 * Static positioning on all breakpoints - flows with document content.
 *
 * Uses design tokens:
 * - border-border: Top border color (--border)
 *
 * Mobile considerations:
 * - Uses pb-[env(safe-area-inset-bottom)] for iOS notch/home indicator
 */
export function ResponsiveBottomBar({
  children,
  className,
}: ResponsiveBottomBarProps) {
  return (
    <div
      className={cn(
        // Static positioning - flows with document content on all breakpoints
        'w-full relative',
        // Full-width border-t using pseudo-element (extends beyond parent container)
        'before:absolute before:top-0 before:left-1/2 before:-translate-x-1/2 before:w-screen before:border-t before:border-border',
        'pb-[env(safe-area-inset-bottom)]',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Spacer component - no longer needed since ResponsiveBottomBar is now static.
 * Kept for backwards compatibility but renders nothing.
 *
 * @deprecated ResponsiveBottomBar is now static on all breakpoints, so no spacer is needed.
 */
export function ResponsiveBottomBarSpacer({
  className: _className,
}: {
  className?: string
}) {
  return null
}
