// ion/Button
import * as R from 'ramda'
import { cva } from 'class-variance-authority'
import clsx from 'clsx'
import * as React from 'react'
import { twMerge } from 'tailwind-merge'
import DisabledTooltip from './DisabledTooltip'

/* ---------------------------------- Type --------------------------------- */

export type ButtonProps =
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    children?: React.ReactNode | React.ReactNode[]
    /** Icon to the left of the button text */
    iconLeading?: React.ReactNode
    /** Icon to the right of the button text */
    iconTrailing?: React.ReactNode
    /** Color of the button
     * @default 'primary'
     */
    color?: 'primary' | 'neutral' | 'danger'
    /** Variant of the button
     * @default 'filled'
     */
    variant?:
      | 'filled'
      | 'outline'
      | 'gradient'
      | 'soft'
      | 'ghost'
      | 'link'
    /** Size of the button
     * @default 'md'
     */
    size?: 'sm' | 'md' | 'lg'
    asDiv?: boolean
    disabledTooltip?: string
    loading?: boolean
  }

/* ---------------------------------- Component --------------------------------- */

export const buttonVariants = cva(
  [
    'flex',
    'items-center',
    'justify-center',
    'disabled:pointer-events-none',
    'whitespace-nowrap',
    'border',
    'h-fit',
    'w-fit',
    'disabled:text-on-disabled',
    'disabled:bg-disabled',
  ],
  {
    variants: {
      variant: {
        filled: 'disabled:bg-disabled border-transparent',
        outline: 'disabled:border-stroke-disabled',
        soft: 'disabled:bg-transparent disabled:border-stroke-disabled border-transparent',
        gradient: 'disabled:bg-disabled border-none',
        ghost: 'focus:bg-opacity-0 border-transparent',
        link: 'border-none disabled:text-disabled',
      },
      color: {
        primary: 'focus-visible:primary-focus',
        neutral: 'focus-visible:neutral-focus',
        danger: 'focus-visible:danger-focus',
      },
      size: {
        sm: 'gap-x-1 px-2 text-sm h-7 rounded-radius-xs',
        md: 'gap-x-1 px-3 text-sm h-8 rounded-radius-sm',
        lg: 'gap-x-2 px-4 text-base h-10 rounded-radius',
        'icon-sm': 'h-7 w-7 rounded-radius-xs p-0',
        'icon-md': 'h-8 w-8 rounded-radius-sm p-0',
        'icon-lg': 'h-10 w-10 rounded-radius p-0',
        'link-sm': 'text-sm',
        'link-md': 'text-base',
        'link-lg': 'text-lg',
      },
    },
    compoundVariants: [
      ...(['primary', 'neutral', 'danger'] as const).flatMap(
        (color) =>
          [
            {
              variant: ['link' as const],
              color: [color],
              className: [
                `hover:text-${color}-hover`,
                `active:text-${color}-pressed`,
                `text-${color}`,
                'p-0 pr-1',
              ],
            },

            {
              variant: ['ghost' as const],
              color: [color],
              className: [
                `text-${color}`,
                `hover:bg-${color}-accent`,
                `active:bg-${color}-container`,
                `active:text-on-${color}-container`,
              ],
            },
            {
              variant: ['soft' as const],
              color: [color],
              className: [
                `bg-${color}-container`,
                `text-on-${color}-container`,
                `hover:border-${color}-sub`,
                `active:bg-${color}-accent`,
              ],
            },
            {
              variant: ['outline' as const],
              color: [color],
              className: [
                `text-${color}`,
                color === 'neutral'
                  ? `border-stroke`
                  : `border-stroke-${color}`,
                `hover:bg-${color}-accent`,
                `active:bg-${color}-container`,
                `active:text-on-${color}-container`,
                'bg-background',
              ],
            },
            {
              variant: ['filled' as const],
              color: [color],
              className: [
                `bg-${color}`,
                `text-on-${color}`,
                `hover:bg-${color}-hover`,
                `active:bg-${color}-pressed`,
              ],
            },
            {
              variant: ['gradient' as const],
              color: [color],
              className: [
                `bg-blend-overlay bg-gradient-to-r from-white/40 to-white/0 bg-${color}`,
                `text-on-${color}`,
                `hover:bg-${color}-hover`,
                `active:bg-${color}-pressed`,
              ],
            },
            {
              variant: ['link' as const],
              color: [color],
              className: [
                `text-${color}`,
                `hover:text-${color}-hover`,
                `active:text-${color}-pressed`,
              ],
            },
          ].flat()
      ),
    ],
  }
)

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      iconTrailing,
      iconLeading,
      color = 'primary',
      variant = 'filled',
      size = 'md',
      disabled,
      disabledTooltip,
      ...props
    },
    ref
  ) => {
    const buttonClassName = twMerge(
      clsx(
        buttonVariants({
          color,
          variant,
          size:
            (iconLeading || iconTrailing) && !children
              ? `icon-${size}`
              : variant === `link`
                ? `link-${size}`
                : size,
        }),
        'transition-shadows transition-colors',
        disabledTooltip && 'group relative',
        className
      )
    )
    /**
     * A dummy component to allow for a button to be rendered as a div
     * This is useful when you have a nested button.
     */
    if (props.asDiv) {
      return (
        <div
          className={buttonClassName}
          ref={ref as React.Ref<HTMLDivElement>}
        >
          {iconLeading}
          {children}
          {iconTrailing}
          {disabled && disabledTooltip && (
            <DisabledTooltip message={disabledTooltip} />
          )}
        </div>
      )
    }
    return (
      <>
        <button
          className={buttonClassName}
          ref={ref}
          {...props}
          disabled={disabled}
        >
          {iconLeading}
          {children}
          {iconTrailing}
          {disabled && disabledTooltip && (
            <DisabledTooltip message={disabledTooltip} />
          )}
        </button>
      </>
    )
  }
)
Button.displayName = 'Button'

export default Button
