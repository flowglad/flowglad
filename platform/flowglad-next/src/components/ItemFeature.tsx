import * as React from 'react'
import { Check, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export interface ItemFeatureProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** The feature text to display */
  children: React.ReactNode
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
 * Displays a feature item with a checkmark icon. On hover, the text
 * gets an underline to indicate it's clickable.
 *
 * Based on the Flowglad Design System.
 *
 * @example
 * ```tsx
 * <ItemFeature>120 HD Video Minutes</ItemFeature>
 * ```
 *
 * @example With link to feature detail page
 * ```tsx
 * <ItemFeature href="/store/features/feature_123">
 *   120 HD Video Minutes
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
const ItemFeature = React.forwardRef<HTMLDivElement, ItemFeatureProps>(
  ({ className, children, icon: Icon = Check, onClick, href, ...props }, ref) => {
    const isClickable = Boolean(onClick) || Boolean(href)

    const content = (
      <>
        <Icon
          className="size-4 shrink-0 text-muted-foreground mt-0.5"
          strokeWidth={2}
        />
        <span className="font-sans font-medium text-sm leading-5 text-foreground border-b border-transparent group-hover:border-foreground transition-colors duration-150 inline-flex items-center flex-wrap">
          {children}
        </span>
      </>
    )

    // If href is provided, render as a Link
    if (href) {
      return (
        <Link
          href={href}
          ref={ref as React.Ref<HTMLAnchorElement>}
          data-slot="item-feature"
          className={cn(
            'group flex items-start gap-1.5 py-1 rounded cursor-pointer',
            className
          )}
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
        className={cn(
          'group flex items-start gap-1.5 py-1 rounded',
          isClickable && 'cursor-pointer',
          className
        )}
        {...props}
      >
        {content}
      </div>
    )
  }
)
ItemFeature.displayName = 'ItemFeature'

export { ItemFeature }

