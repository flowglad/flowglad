// ion/SideNavigationItem: Generated with Ion on 9/20/2024, 10:31:45 PM
import * as NavigationMenuPrimitive from '@radix-ui/react-navigation-menu'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import clsx from 'clsx'
import * as React from 'react'
import { twMerge } from 'tailwind-merge'

/* ---------------------------------- Component --------------------------------- */

const NavigationMenu = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <NavigationMenuPrimitive.Root
    ref={ref}
    className={twMerge(
      clsx(
        'relative z-10 flex w-full [&>*:first-child]:w-full',
        className
      )
    )}
    {...props}
  >
    {children}
  </NavigationMenuPrimitive.Root>
))
NavigationMenu.displayName = NavigationMenuPrimitive.Root.displayName

/* ---------------------------------- Component --------------------------------- */

const NavigationMenuItem = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.Item
    ref={ref}
    className={clsx('w-full', className)}
    {...props}
  />
))
NavigationMenuItem.displayName = 'NavigationMenuItem'

/* ---------------------------------- Component --------------------------------- */

const NavigationMenuList = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.List>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.List
    ref={ref}
    className={clsx('flex flex-1 list-none', className)}
    {...props}
  />
))
NavigationMenuList.displayName =
  NavigationMenuPrimitive.List.displayName

/* ---------------------------------- Type --------------------------------- */

export interface NavigationMenuLinkProps
  extends React.ComponentPropsWithoutRef<
    typeof NavigationMenuPrimitive.Link
  > {
  /** Displays the link as selected */
  selected?: boolean
  /** Content to the right of the link text */
  extra?: React.ReactNode
  /** Icon the left of the link text */
  iconLeading?: React.ReactNode
  /** Icon the right of the link text */
  iconTrailing?: React.ReactNode
  /** Appearance of the link
   * @default 'default'
   */
  type?: 'default' | 'filled'
  /** Whether the link is a child of another link */
  isChild?: boolean
  className?: string
  children?: React.ReactNode
}

/* ---------------------------------- Component --------------------------------- */

const navigationMenuLinkClassnames = cva(
  'group flex w-full font-medium cursor-pointer justify-between items-center gap-3 rounded-radius-xs border-transparent px-3 py-2 text-base no-underline outline-none transition-colors',
  {
    variants: {
      type: {
        filled:
          'text-on-primary hover:bg-primary-hover hover:text-on-primary-hover',
        default: 'text-secondary hover:bg-list-item-background-hover',
      },
      selected: {
        true: '',
        false: '',
      },
      isChild: {
        true: 'pl-2',
        false: '',
      },
    },
    compoundVariants: [
      {
        type: 'filled',
        selected: false,
        className: 'bg-primary-pressed',
      },
      {
        type: 'filled',
        selected: true,
        className: 'bg-primary-hover text-on-primary-hover',
      },
      {
        type: 'default',
        selected: false,
        // className: 'bg-background',
      },
      {
        type: 'default',
        selected: true,
        className:
          'bg-white bg-opacity-[0.07] text-on-primary-container',
      },
    ],
  }
)

const NavigationMenuLink = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Link>,
  NavigationMenuLinkProps
>(
  (
    {
      className,
      selected = false,
      children,
      iconLeading,
      iconTrailing,
      extra,
      isChild = false,
      type = 'default',
      ...props
    },
    ref
  ) => (
    <NavigationMenuPrimitive.Link
      ref={ref}
      className={twMerge(
        clsx(
          navigationMenuLinkClassnames({
            type,
            selected,
            isChild,
          }),
          !children && 'w-fit'
        ),
        className
      )}
      {...props}
    >
      <span className={clsx('flex items-center truncate h-6')}>
        <Slot
          className={twMerge(
            clsx(
              'shrink-0 text-subtle flex items-center',
              type === 'default' && {
                'text-subtle': !selected,
                'text-on-primary-container': selected,
                'group-hover:text-secondary': !selected,
              },
              type === 'filled' && 'text-on-primary'
            )
          )}
        >
          {iconLeading}
        </Slot>
        {children && <span className="truncate">{children}</span>}
        {extra}
      </span>
      {children && (
        <Slot
          className={clsx(
            'shrink-0',
            type === 'default' && {
              'text-subtle': !selected,
              'text-on-primary-container': selected,
              'group-hover:text-secondary': true,
            },
            type === 'filled' && 'text-on-primary'
          )}
        >
          {iconTrailing}
        </Slot>
      )}
    </NavigationMenuPrimitive.Link>
  )
)
NavigationMenuLink.displayName = 'NavigationMenuLink'

export {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
}
