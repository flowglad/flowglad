// Generated with Ion on 10/7/2024, 11:17:18 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=765:40804

import { cn } from '@/lib/utils'
import core from '@/utils/core'
import * as PopoverPrimitive from '@radix-ui/react-popover'

export enum PopoverMenuItemState {
  Default = 'default',
  Danger = 'danger',
}

export interface PopoverMenuItemProps {
  children: React.ReactNode
  className: string
  state?: PopoverMenuItemState
  disabled?: boolean
  helperText?: string
  icon?: React.ReactNode
  onClick: () => void
}

export interface PopoverMenuItem {
  label: string
  state?: PopoverMenuItemState
  disabled?: boolean
  helperText?: string
  icon?: React.ReactNode
  handler: () => void
}

export interface PopoverMenuProps {
  items: PopoverMenuItem[]
}

const PopoverMenuItem = ({
  children,
  className,
  state,
  onClick,
  disabled,
  helperText,
  icon,
}: PopoverMenuItemProps) => {
  return (
    <PopoverPrimitive.Close asChild>
      <div
        className={cn(
          'relative flex cursor-default select-none items-start rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
          helperText ? 'flex-col gap-1' : 'items-center gap-2',
          className,
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer'
        )}
        onClick={disabled ? undefined : onClick}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <div
          className={cn('flex flex-col', helperText ? 'gap-1' : '')}
        >
          <div
            className={cn(
              'whitespace-normal break-words',
              state === PopoverMenuItemState.Danger
                ? 'text-destructive'
                : ''
            )}
          >
            {children}
          </div>
          {helperText && (
            <p className="text-xs text-muted-foreground whitespace-normal break-words">
              {helperText}
            </p>
          )}
        </div>
      </div>
    </PopoverPrimitive.Close>
  )
}

const PopoverMenu = ({ items }: PopoverMenuProps) => {
  return (
    <div className="flex flex-col w-full">
      {items.map((item, index) => (
        <PopoverMenuItem
          key={index}
          className={cn('w-full justify-start text-left')}
          state={item.state}
          disabled={item.disabled}
          helperText={item.helperText}
          icon={item.icon}
          onClick={item.handler}
        >
          {item.label}
        </PopoverMenuItem>
      ))}
    </div>
  )
}

export default PopoverMenu
