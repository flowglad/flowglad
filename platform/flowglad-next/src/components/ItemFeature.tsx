import * as React from 'react'
import { Check, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ItemFeatureProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'> {
  /** The feature text to display */
  children: React.ReactNode
  /** Optional custom icon component (defaults to Check) */
  icon?: LucideIcon
  /** Optional click handler - makes the item interactive */
  onClick?: () => void
  /**
   * TODO: Add href prop to make this a link to a feature detail page
   * when the feature detail page is implemented.
   * Example: href?: string
   */
}

/**
 * ItemFeature component
 *
 * Displays a feature item with a checkmark icon. On hover, the text
 * gets an underline to indicate it will eventually be clickable.
 *
 * Based on the Flowglad Design System.
 *
 * @example
 * ```tsx
 * <ItemFeature>120 HD Video Minutes</ItemFeature>
 * ```
 *
 * @example With custom icon and click handler
 * ```tsx
 * <ItemFeature icon={Plus} onClick={() => console.log('clicked')}>
 *   Add feature
 * </ItemFeature>
 * ```
 *
 * TODO: When the feature detail page is implemented, add link functionality:
 * - Accept an href prop
 * - Wrap with Next.js Link component
 * - Make the component navigable
 */
const ItemFeature = React.forwardRef<HTMLDivElement, ItemFeatureProps>(
  ({ className, children, icon: Icon = Check, onClick, ...props }, ref) => {
    const isClickable = Boolean(onClick)

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
        <Icon
          className="size-4 shrink-0 text-muted-foreground mt-0.5"
          strokeWidth={2}
        />
        <span className="font-sans font-medium text-sm leading-5 text-foreground border-b border-transparent group-hover:border-foreground transition-colors duration-150 inline-flex items-center flex-wrap">
          {children}
        </span>
      </div>
    )
  }
)
ItemFeature.displayName = 'ItemFeature'

export { ItemFeature }

