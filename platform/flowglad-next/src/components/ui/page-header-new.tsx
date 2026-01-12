import { ChevronLeft, MoreHorizontal } from 'lucide-react'
import type { ReactNode } from 'react'
import React from 'react'
import { LAYOUT_TOKENS } from '@/components/charts/constants'
import { cn } from '@/lib/utils'
import { Button } from './button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip'

/**
 * Design Tokens Extracted from Figma:
 *
 * Typography:
 * - Breadcrumb: Berkeley Mono Variable, Medium (500), 14px, line-height 1.2
 * - Heading: Sans-serif, Medium (500), 24px, line-height 1.35, tracking -0.24px
 * - Body/Labels: SF Pro, Medium (500), 14px, line-height 20px
 *
 * Colors:
 * - Foreground: hsl(var(--foreground))
 * - Muted Foreground: hsl(var(--muted-foreground))
 * - Jade Foreground: hsl(var(--jade-foreground))
 * - Jade Muted Foreground: hsl(var(--jade-muted-foreground))
 * - Jade Background: hsl(var(--jade-background))
 * - Secondary BG: hsl(var(--secondary))
 * - Secondary Foreground: hsl(var(--secondary-foreground))
 * - Border: hsl(var(--border))
 *
 * Spacing:
 * - spacing/0: 0px
 * - spacing/1: 4px
 * - spacing/2: 8px
 * - spacing/4: 16px
 *
 * Patterns:
 * - Breadcrumb navigation with back button
 * - Status badges with icons and separators
 * - Full-width button group with equal-width action buttons
 * - Bottom border with dashed style
 */

interface StatusBadge {
  icon?: ReactNode
  label: ReactNode
  variant?: 'active' | 'muted' | 'destructive' | 'warning'
  /** Optional tooltip text to display on hover */
  tooltip?: string
}

interface PageHeaderAction {
  label: string
  onClick?: () => void
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
  disabled?: boolean
  /** Tooltip text to display when button is disabled */
  disabledTooltip?: string
}

interface PageHeaderNewProps {
  /** Main page title */
  title: string
  /** Optional breadcrumb text */
  breadcrumb?: string
  /** Optional breadcrumb click handler */
  onBreadcrumbClick?: () => void
  /** Status badges to display below title */
  badges?: StatusBadge[]
  /** Optional description text or element */
  description?: ReactNode
  /** Action buttons to display */
  actions?: PageHeaderAction[]
  /** Show more menu button */
  showMoreMenu?: boolean
  /** More menu click handler */
  onMoreMenuClick?: () => void
  /** Additional CSS classes */
  className?: string
  /** Hide the bottom dashed border */
  hideBorder?: boolean
}

export function PageHeaderNew({
  title,
  breadcrumb,
  onBreadcrumbClick,
  badges = [],
  description,
  actions = [],
  showMoreMenu = false,
  onMoreMenuClick,
  className,
  hideBorder = false,
}: PageHeaderNewProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-start justify-center w-full gap-2',
        !hideBorder && 'border-b border-dashed border-border',
        LAYOUT_TOKENS.page.class,
        'pt-20 pb-2',
        className
      )}
    >
      {/* Headline wrapper */}
      <div className="flex flex-col gap-1 items-start w-full">
        {/* Breadcrumb navigation - always render container to prevent layout shift */}
        <div className="flex items-center gap-1 min-h-5">
          {breadcrumb && onBreadcrumbClick ? (
            <button
              onClick={onBreadcrumbClick}
              className="flex items-center gap-1 hover:opacity-70 transition-opacity cursor-pointer"
              type="button"
            >
              <ChevronLeft size={14} />
              <span className="font-mono font-medium text-sm text-muted-foreground leading-[1.2]">
                {breadcrumb}
              </span>
            </button>
          ) : breadcrumb ? (
            <>
              <ChevronLeft size={14} />
              <span className="font-mono font-medium text-sm text-muted-foreground leading-[1.2]">
                {breadcrumb}
              </span>
            </>
          ) : null}
        </div>

        {/* Page title */}
        <h1 className="text-2xl text-foreground leading-[1.35] w-full">
          {title}
        </h1>
      </div>

      {/* Status badges and description */}
      {(badges.length > 0 || description) && (
        <div className="flex flex-wrap items-center gap-2 w-full px-0">
          <TooltipProvider delayDuration={300}>
            {badges.map((badge, index) => {
              const badgeContent = (
                <div
                  className={cn(
                    'flex items-center justify-center gap-1 px-0 py-0.5 rounded',
                    badge.variant === 'active' &&
                      'text-[hsl(var(--jade-muted-foreground))]',
                    badge.variant === 'muted' &&
                      'text-muted-foreground',
                    badge.variant === 'destructive' &&
                      'text-destructive',
                    badge.variant === 'warning' &&
                      'text-yellow-600 dark:text-yellow-400'
                  )}
                >
                  {badge.icon && (
                    <div className="w-[14px] h-[14px] flex items-center justify-center">
                      {badge.icon}
                    </div>
                  )}
                  <span className="font-sans font-medium text-sm leading-[1.2]">
                    {badge.label}
                  </span>
                </div>
              )

              return (
                <div
                  key={index}
                  className="flex items-center gap-2 whitespace-nowrap"
                >
                  {/* Badge with optional tooltip */}
                  {badge.tooltip ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {badgeContent}
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        <p>{badge.tooltip}</p>
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    badgeContent
                  )}

                  {/* Separator (if not last badge or if description follows) */}
                  {(index < badges.length - 1 || description) && (
                    <div className="h-[22px] w-px bg-muted-foreground opacity-10" />
                  )}
                </div>
              )
            })}
          </TooltipProvider>

          {/* Optional description */}
          {description && (
            <div className="font-sans font-medium text-sm text-muted-foreground leading-5 whitespace-nowrap">
              {description}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      {(actions.length > 0 || showMoreMenu) && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full px-0 pt-2 pb-4">
          <TooltipProvider delayDuration={0}>
            {actions.map((action, index) => {
              const button = (
                <Button
                  key={index}
                  variant={action.variant || 'secondary'}
                  onClick={action.onClick}
                  className="w-full sm:flex-1 sm:basis-0 sm:grow sm:shrink sm:min-w-0 h-9"
                  disabled={action.disabled}
                >
                  {action.label}
                </Button>
              )

              // Wrap disabled buttons with tooltip if disabledTooltip is provided
              if (action.disabled && action.disabledTooltip) {
                return (
                  <Tooltip key={index}>
                    <TooltipTrigger asChild>
                      {/* Wrapper div needed because disabled buttons don't fire events */}
                      <div className="w-full sm:flex-1 sm:basis-0 sm:grow sm:shrink sm:min-w-0">
                        {button}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{action.disabledTooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                )
              }

              return button
            })}
          </TooltipProvider>

          {/* More menu button */}
          {showMoreMenu && (
            <Button
              variant="secondary"
              size="icon"
              onClick={onMoreMenuClick}
              className="w-full sm:w-9 h-9 sm:min-w-9 sm:max-w-9 shrink-0"
              aria-label="More options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
