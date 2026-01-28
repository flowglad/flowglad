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
 * - Mobile (< sm): Fixed at viewport bottom, moves up with keyboard
 * - Desktop (>= sm): Static, flows with document content
 *
 * Mobile keyboard behavior:
 * - Requires viewport meta with `interactive-widget=resizes-content`
 * - The fixed positioning naturally moves up when keyboard appears
 *   because the visual viewport shrinks
 *
 * Uses design tokens:
 * - border-border: Top border color (--border)
 *
 * IMPORTANT: Do NOT add bg-background to this component.
 * The parent container (e.g., OnboardingShell) handles the background.
 * Adding a background here would break the visual layering with
 * decorative border elements that extend beyond this container.
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
        // Mobile: fixed positioning at bottom with horizontal padding
        // NOTE: Do NOT add bg-background here - parent handles background
        'fixed left-0 bottom-0 right-0 z-50',
        'border-t border-border',
        'px-6 pb-[env(safe-area-inset-bottom)]',
        // Desktop (sm+): reset to static positioning with full-bleed border, no padding
        'sm:static sm:left-auto sm:bottom-auto sm:right-auto sm:z-auto',
        'sm:w-full sm:relative sm:border-t-0 sm:px-0',
        'sm:before:absolute sm:before:top-0 sm:before:left-1/2 sm:before:-translate-x-1/2 sm:before:w-screen sm:before:border-t sm:before:border-border',
        className
      )}
    >
      {children}
    </div>
  )
}

/**
 * Spacer component to prevent content from being hidden behind
 * the ResponsiveBottomBar on mobile (where it's fixed).
 * On desktop (sm+), this renders nothing since the bar is static.
 *
 * Place this at the end of your content, before the ResponsiveBottomBar.
 */
export function ResponsiveBottomBarSpacer({
  className,
}: {
  className?: string
}) {
  return (
    <div
      className={cn(
        // Mobile: add space for the fixed bar (~60px typical height + safe area)
        'h-20 pb-[env(safe-area-inset-bottom)]',
        // Desktop (sm+): no spacer needed since bar is static
        'sm:h-0 sm:pb-0',
        className
      )}
      aria-hidden="true"
    />
  )
}
