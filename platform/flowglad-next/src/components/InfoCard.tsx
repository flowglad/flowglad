'use client'

import { Info, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InfoCardProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Title text displayed next to the icon */
  title?: string
  /** Body content - can be a string or React node */
  children?: React.ReactNode
  /** Optional message text (alternative to children) */
  message?: string
  /** Optional icon component, defaults to Info */
  icon?: LucideIcon
  /** Optional action link text */
  actionText?: string
  /** Optional action link href */
  actionHref?: string
  /** Optional action link onClick handler */
  actionOnClick?: () => void
}

/**
 * A reusable card component for displaying informational content with an icon, title, body text, and optional action link.
 *
 * @param props - Component props
 * @param props.title - Title text displayed next to the icon (defaults to 'Details')
 * @param props.children - Body content - can be a string or React node
 * @param props.message - Optional message text (alternative to children)
 * @param props.icon - Optional icon component, defaults to Info
 * @param props.actionText - Optional action link text
 * @param props.actionHref - Optional action link href
 * @param props.actionOnClick - Optional action link onClick handler
 */
const InfoCard = React.forwardRef<HTMLDivElement, InfoCardProps>(
  (
    {
      className,
      title = 'Details',
      children,
      message,
      icon: Icon = Info,
      actionText,
      actionHref,
      actionOnClick,
      ...props
    },
    ref
  ) => {
    const bodyContent = children ?? message

    return (
      <div
        ref={ref}
        data-slot="info-card"
        className={cn(
          'flex flex-col gap-3 px-3 py-2.5',
          'bg-accent rounded-sm border border-border',
          className
        )}
        {...props}
      >
        {/* Title Section with Icon */}
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-foreground" strokeWidth={2} />
          <h3 className="text-sm font-medium leading-5 text-foreground">
            {title}
          </h3>
        </div>

        {/* Body Content */}
        {bodyContent && (
          <div className="text-sm font-normal leading-5 text-muted-foreground">
            {typeof bodyContent === 'string' ? (
              <p>{bodyContent}</p>
            ) : (
              bodyContent
            )}
          </div>
        )}

        {/* Action Link */}
        {(actionHref || actionOnClick) && actionText && (
          <>
            {actionHref ? (
              <Link
                href={actionHref}
                className="text-sm font-normal leading-5 text-muted-foreground hover:text-foreground hover:underline transition-colors"
              >
                {actionText} &gt;
              </Link>
            ) : (
              <button
                type="button"
                onClick={actionOnClick}
                className="text-sm font-normal leading-5 text-muted-foreground hover:text-foreground hover:underline transition-colors text-left"
              >
                {actionText} &gt;
              </button>
            )}
          </>
        )}
      </div>
    )
  }
)
InfoCard.displayName = 'InfoCard'

export { InfoCard }
