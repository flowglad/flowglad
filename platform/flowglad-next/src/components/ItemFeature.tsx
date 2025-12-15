import { Check, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ItemFeatureProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** The feature text to display */
  children: React.ReactNode
  /** Optional description text displayed below the main content */
  description?: React.ReactNode
  /** Optional custom icon component (defaults to Check) */
  icon?: LucideIcon
  /** Optional click handler - makes the item interactive */
  onClick?: () => void
  /** Optional href to make this a link to a feature detail page */
  href?: string
}

/**
 * ItemFeature component
 *
 * Displays a feature item with a checkmark icon. On hover, the item
 * gets a subtle accent background to indicate it's interactive.
 *
 * Based on the Flowglad Design System.
 *
 * @example Basic usage
 * ```tsx
 * <ItemFeature>120 HD Video Minutes</ItemFeature>
 * ```
 *
 * @example With description (stacked below)
 * ```tsx
 * <ItemFeature
 *   href="/features/feature_123"
 *   description="3,000 total credits, every billing period"
 * >
 *   3,000 o4-mini-high Messages/Month
 * </ItemFeature>
 * ```
 *
 * @example With custom icon and click handler
 * ```tsx
 * <ItemFeature icon={Plus} onClick={() => console.log('clicked')}>
 *   Add feature
 * </ItemFeature>
 * ```
 */
const ItemFeature = React.forwardRef<
  HTMLDivElement,
  ItemFeatureProps
>(
  (
    {
      className,
      children,
      description,
      icon: Icon = Check,
      onClick,
      href,
      ...props
    },
    ref
  ) => {
    const isClickable = Boolean(onClick) || Boolean(href)

    // Item wrapper matches Figma's "Item wrapper" structure
    // gap-1.5 = 6px between icon and text (Figma: gap-[6px])
    // Icon aligns to start when description is present
    const content = (
      <span
        className={cn(
          'flex gap-1.5 min-w-0',
          description ? 'items-start' : 'items-center'
        )}
      >
        <Icon
          className={cn(
            'size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors',
            description && 'mt-0.5'
          )}
          strokeWidth={2}
        />
        <span className="flex flex-col min-w-0">
          <span className="font-sans font-medium text-sm leading-5 text-foreground break-words">
            {children}
          </span>
          {description && (
            <span className="font-sans font-normal text-sm leading-5 text-muted-foreground group-hover:text-foreground transition-colors break-words">
              {description}
            </span>
          )}
        </span>
      </span>
    )

    // Container styles: w-full px-3 py-1 rounded flex items-center
    const containerClasses = cn(
      'group flex items-center w-full px-3 py-1 rounded transition-colors',
      isClickable && 'cursor-pointer hover:bg-accent',
      className
    )

    // If href is provided, render as a Link
    if (href) {
      return (
        <Link
          href={href}
          ref={ref as React.Ref<HTMLAnchorElement>}
          data-slot="item-feature"
          onClick={onClick}
          className={containerClasses}
          {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}
        >
          {content}
        </Link>
      )
    }

    // Otherwise render as a div (with optional onClick)
    return (
      <div
        ref={ref}
        data-slot="item-feature"
        role={isClickable ? 'button' : undefined}
        tabIndex={isClickable ? 0 : undefined}
        onClick={onClick}
        onKeyDown={
          isClickable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onClick?.()
                }
              }
            : undefined
        }
        className={containerClasses}
        {...props}
      >
        {content}
      </div>
    )
  }
)
ItemFeature.displayName = 'ItemFeature'

export { ItemFeature }
