// src/components/onboarding/FixedBottomBar.tsx

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

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
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-background border-t border-border',
        'px-4 pb-[env(safe-area-inset-bottom)]',
        className
      )}
    >
      {children}
    </div>
  )
}

interface FixedBottomBarSpacerProps {
  /** Height of the fixed bar to account for. Defaults to 60px */
  height?: number
}

/**
 * Spacer to prevent content from being hidden behind FixedBottomBar.
 * Place at the end of scrollable content, INSIDE the scrollable container.
 *
 * Accounts for both the bar height and iOS safe-area-inset-bottom.
 */
export function FixedBottomBarSpacer({
  height = 60,
}: FixedBottomBarSpacerProps) {
  return (
    <div
      className="pb-[env(safe-area-inset-bottom)]"
      style={{ paddingTop: height }}
      aria-hidden="true"
    />
  )
}
