// Generated with Ion on 9/24/2024, 3:10:31 AM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=430:1834
// ion/Input: Generated with Ion on 9/24/2024, 3:10:31 AM
import clsx from 'clsx'
import * as React from 'react'
import { twMerge } from 'tailwind-merge'

import Hint from '@/components/ion/Hint'
import Label from '@/components/ion/Label'

interface InputContainerProps {
  error?: boolean | string
  disabled?: boolean
}
/* ---------------------------------- Component --------------------------------- */

export const inputContainerClasses = ({
  error,
  disabled,
}: InputContainerProps) =>
  clsx(
    [
      'flex gap-2',
      'items-center',
      'w-full',
      'rounded-radius-sm',
      'border',
      'px-3',
      'text-sm',
      'transition-shadow',
      'text-foreground',
      'overflow-hidden',
      'h-9',
      'hover:border-outline',
      'transition-all',
      disabled ? 'bg-disabled' : 'bg-background',
      'file:bg-transparent',
    ],
    {
      'focus-within:danger-focus border-danger hover:border-danger focus-within:border-danger-stroke':
        error,
      'focus-within:primary-focus focus-within:bg-background focus-within:border-stroke-primary focus-within:hover:border-stroke-primary border-stroke':
        !error,
      'border-stroke-disabled pointer-events-none text-on-disabled':
        disabled,
    }
  )

export const InputContainer = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLSpanElement> & InputContainerProps
>(({ className, error, disabled, ...props }, ref) => {
  const containerClasses = inputContainerClasses({
    error,
    disabled,
  })
  return (
    <span
      ref={ref}
      className={twMerge(
        containerClasses,
        disabled && 'text-on-disabled bg-disabled',
        className
      )}
      {...props}
    />
  )
})
InputContainer.displayName = 'InputContainer'

/* ---------------------------------- Type --------------------------------- */

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Icon to the left of the input text */
  iconLeading?: React.ReactNode
  /** Icon to the right of the input text */
  iconTrailing?: React.ReactNode
  /** Label of the input */
  label?: string
  /** Helper text, to the right of the label */
  helper?: string
  /** Hint/description below the input  */
  hint?: string
  /** Display hint icon to the left of the hint
   * @default false
   */
  showHintIcon?: boolean
  /** Display required mark to the right of the label */
  required?: boolean
  /** Display the input with an error state */
  error?: boolean | string
  /** Classname of the container (use this to position the input) */
  className?: string
  /** Classname of the input (use this to restyle the input) */
  inputClassName?: string
}

/* ---------------------------------- Component --------------------------------- */

export const inputClassNames = clsx(
  'h-full w-full flex-shrink bg-transparent focus:outline-none focus:ring-0 focus:ring-offset-0 disabled:pointer-events-none',
  'placeholder:text-subtle disabled:text-on-disabled',
  'disabled:placeholder:text-on-disabled',
  'border-none',
  'px-0',
  'autofill:bg-transparent',
  'autofill:text-on-disabled',
  'autofill:hover:bg-transparent',
  'autofill:focus:bg-transparent',
  'autofill:active:bg-transparent',
  'autofill:text-inherit'
  // '[&::-webkit-autofill]:bg-yellow-50',
  // '[&::-webkit-autofill]:shadow-[0_0_0px_1000px_theme(colors.yellow.50)_inset]',
  // '[&::-webkit-autofill]:hover:bg-yellow-50',
  // '[&::-webkit-autofill]:focus:bg-yellow-50',
  // '[&::-webkit-autofill]:active:bg-yellow-50'
)

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      inputClassName,
      type,
      error,
      required = false,
      helper,
      label,
      hint,
      showHintIcon = false,
      iconLeading,
      iconTrailing,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId()
    const id = props.id ?? generatedId
    const ariaInvalid = props['aria-invalid'] ?? !!error

    return (
      <div className={className}>
        {label && (
          <Label
            id={`${id}__label`}
            htmlFor={id}
            required={required}
            helper={helper}
            disabled={disabled}
            className="mb-1"
          >
            {label}
          </Label>
        )}
        <InputContainer
          className={clsx(
            !disabled && 'bg-background-input',
            inputClassName
          )}
          error={error}
          disabled={disabled}
        >
          {iconLeading && (
            <span
              className={clsx('text-foreground', {
                'text-on-disabled': disabled,
              })}
            >
              {iconLeading}
            </span>
          )}
          <input
            id={id}
            ref={ref}
            aria-required={required}
            aria-invalid={ariaInvalid}
            aria-describedby={hint ? `${id}__hint` : undefined}
            className={inputClassNames}
            type={type}
            {...props}
          />
          {iconTrailing && (
            <span
              className={clsx('text-foreground pr-4', {
                'text-on-disabled': disabled,
              })}
            >
              {iconTrailing}
            </span>
          )}
        </InputContainer>
        {hint && (
          <Hint
            id={`${id}__hint`}
            className="text-xs text-subtle mt-1"
            showIcon={showHintIcon}
            disabled={disabled}
          >
            {hint}
          </Hint>
        )}
        {error && (
          <Hint
            id={`${id}__error`}
            error={error}
            className="mt-1 text-danger"
            showIcon={showHintIcon}
            disabled={disabled}
          >
            {error}
          </Hint>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export default Input
