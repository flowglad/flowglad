import { cn } from '@/lib/utils'
import { PopoverClose } from '@/components/ui/popover'

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
  const content = (
    <div
      className={cn(
        'relative flex cursor-default select-none items-start rounded-lg px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        helperText ? 'flex-col gap-1' : 'items-center gap-1.5',
        className,
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      )}
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <div className={cn('flex flex-col', helperText ? 'gap-1' : '')}>
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
  )

  // Only wrap with PopoverClose if the item is enabled
  return disabled ? (
    content
  ) : (
    <PopoverClose asChild>{content}</PopoverClose>
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
