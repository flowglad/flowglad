// Generated with Ion on 9/24/2024, 7:45:21 PM
// Figma Link: https://www.figma.com/design/3fYHKpBnD7eYSAmfSvPhvr?node-id=430:1834
// ion/NumberInput: Generated with Ion on 9/24/2024, 7:45:21 PM
import { Minus, Plus } from 'lucide-react'
import clsx from 'clsx'
import React, {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import {
  type OnValueChange,
  NumericFormat,
} from 'react-number-format'
import { twMerge } from 'tailwind-merge'

import Hint from '@/components/ion/Hint'
import {
  inputClassNames,
  InputContainer,
} from '@/components/ion/Input'
import Label from '@/components/ion/Label'
import { UseFormRegisterReturn } from 'react-hook-form'

/** Credit to https://github.com/mantinedev/mantine/blob/master/packages/@mantine/core/src/components/NumberInput/NumberInput.tsx */

/* ---------------------------------- Util --------------------------------- */
// re for -0, -0., -0.0, -0.00, -0.000 ... strings
const partialNegativeNumberPattern = /^-0(.0*)?$/

// re for 01, 006, 0002 ... and negative counterparts
const leadingZerosPattern = /^-?0d+$/

export interface NumberInputControlHandlers {
  increment: () => void
  decrement: () => void
}

/**
 * Check if the value is a valid number
 * @param value - The value to check
 *  */
function isValidNumber(
  value: number | string | undefined | null
): value is number {
  return (
    (typeof value === 'number'
      ? value < Number.MAX_SAFE_INTEGER
      : !Number.isNaN(Number(value))) && !Number.isNaN(value)
  )
}
/**
 * Get the number of decimal places in a number
 */
function getDecimalPlaces(inputValue: number | string) {
  const match = String(inputValue).match(
    /(?:.(d+))?(?:[eE]([+-]?d+))?$/
  )
  if (!match) {
    return 0
  }
  return Math.max(
    0,
    (match[1] ? match[1].length : 0) - (match[2] ? +match[2] : 0)
  )
}

/**
 * Returns a valid value depending on the min and max values
 */
export function clamp(
  value: number,
  min: number | undefined,
  max: number | undefined
) {
  if (min === undefined && max === undefined) {
    return value
  }
  if (min !== undefined && max === undefined) {
    return Math.max(value, min)
  }
  if (min === undefined && max !== undefined) {
    return Math.min(value, max)
  }
  return Math.min(Math.max(value, min!), max!)
}

/**
 * Increment or decrement the value of the input
 */
function incrementOrDecrement({
  action,
  setValue,
  inputRef,
  value,
  startValue,
  step,
  min,
  max,
  onValueChange,
}: IncrementOrDecrementProps) {
  let val: number
  const currentValuePrecision = getDecimalPlaces(value ?? startValue)
  const incrementStep = action === 'increment' ? step : -step
  const stepPrecision = getDecimalPlaces(incrementStep)
  const maxPrecision = Math.max(currentValuePrecision, stepPrecision)
  const factor = 10 ** maxPrecision

  if (typeof value !== 'number' || Number.isNaN(value)) {
    val = clamp(startValue, min, max)
  } else {
    if (action === 'increment') {
      if (max !== undefined) {
        const incrementedValue =
          (Math.round(value * factor) +
            Math.round(incrementStep * factor)) /
          factor
        val = incrementedValue <= max ? incrementedValue : max
      } else {
        val =
          (Math.round(value * factor) +
            Math.round(incrementStep * factor)) /
          factor
      }
    } else {
      const decrementedValue =
        (Math.round(value * factor) - Math.round(step * factor)) /
        factor
      val =
        min !== undefined && decrementedValue < min
          ? min
          : decrementedValue
    }
  }

  const formattedValue = val.toFixed(maxPrecision)
  setValue(parseFloat(formattedValue))
  onValueChange?.(
    {
      floatValue: parseFloat(formattedValue),
      formattedValue,
      value: formattedValue,
    },
    { source: action as any }
  )
  setTimeout(() => {
    const position = inputRef.current?.value?.length
    if (inputRef.current && typeof position !== 'undefined') {
      inputRef.current.setSelectionRange(position, position)
    }
  }, 1)
}
/* ---------------------------------- Types --------------------------------- */

export interface NumberInputControlHandlers {
  increment: () => void
  decrement: () => void
}

interface IncrementOrDecrementProps {
  /** The action to perform. */
  action: 'increment' | 'decrement'
  /** The function to set the value. */
  setValue: Dispatch<SetStateAction<string | number | undefined>>
  /** The input element reference. */
  inputRef: React.RefObject<HTMLInputElement>
  /** The current value. */
  value: string | number | undefined
  /** The start value to increment or decrement from. */
  startValue: number
  /** The amount to increment or decrement the value by. */
  step: number
  /** The minimum value that the input can be set to. */
  min?: number
  /** The maximum value that the input can be set to. */
  max?: number
  /** The function to call when the value changes. */
  onValueChange?: NumberInputProps['onValueChange']
}

/** Checkout the react-number-format documentation for more functionality. @see {@link https://s-yadav.github.io/react-number-format/docs/numeric_format} */
export interface NumberInputProps
  extends React.ComponentPropsWithoutRef<typeof NumericFormat> {
  /** The maximum value that the input can be set to. */
  max?: number
  /** The minimum value that the input can be set to. */
  min?: number
  /** The start value to increment or decrement from. */
  startValue?: number
  /** The amount to increment or decrement the value by. */
  step?: number
  /** Whether to allow leading zeros. */
  allowLeadingZeros?: boolean
  /** Whether to show the controls. */
  showControls?: boolean
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
  /** The class name to apply to the input container. */
  inputClassName?: string
  /** Control ref to access the increment and decrement functions */
  controlsRef?: React.RefObject<NumberInputControlHandlers>
  register?: UseFormRegisterReturn
}
/* ---------------------------------- Component --------------------------------- */
const NumberInput = React.forwardRef<
  HTMLInputElement,
  NumberInputProps
>(
  (
    {
      label,
      hint,
      helper,
      required,
      showHintIcon,
      iconLeading,
      iconTrailing,
      error,
      min,
      max,
      value,
      defaultValue,
      startValue = 0,
      step = 1,
      onValueChange,
      onBlur,
      onKeyDown,
      allowLeadingZeros = false,
      showControls = true,
      className,
      inputClassName,
      controlsRef,
      ...props
    },
    passedRef
  ) => {
    const restProps = props.register ?? {}
    const generatedId = React.useId()
    const id = props.id ?? generatedId
    const ariaInvalid = props['aria-invalid'] ?? !!error

    const [_value, _setValue] = useState<string | number | undefined>(
      value ?? defaultValue ?? undefined
    )
    const inputRef = useRef<HTMLInputElement>(null)
    useImperativeHandle(
      passedRef,
      () => inputRef.current as HTMLInputElement
    )
    /**
     * Support imperative override of value
     */
    useEffect(() => {
      let newValue = value
      if (newValue === null) {
        newValue = undefined
      }
      _setValue(newValue)
    }, [value])
    const increment = useRef<() => void>()
    increment.current = () =>
      incrementOrDecrement({
        action: 'increment',
        inputRef,
        value: _value,
        setValue: _setValue,
        startValue,
        step,
        min,
        max,
        onValueChange,
      })

    const decrement = useRef<() => void>()
    decrement.current = () =>
      incrementOrDecrement({
        action: 'decrement',
        inputRef,
        value: _value,
        setValue: _setValue,
        startValue,
        step,
        min,
        max,
        onValueChange: onValueChange,
      })

    useImperativeHandle(controlsRef, () => ({
      increment: increment.current!,
      decrement: decrement.current!,
    }))

    const onIncrement = useCallback(() => {
      inputRef.current?.focus()
      increment.current!()
    }, [])
    const onDecrement = useCallback(() => {
      inputRef.current?.focus()
      decrement.current!()
    }, [])

    const handleValueChange: OnValueChange = (payload, event) => {
      if (event.source === 'event') {
        _setValue(
          isValidNumber(payload.floatValue) &&
            !partialNegativeNumberPattern.test(payload.value) &&
            !(allowLeadingZeros
              ? leadingZerosPattern.test(payload.value)
              : false)
            ? payload.floatValue
            : payload.value
        )
      }
      onValueChange?.(payload, event)
    }

    return (
      <div className={className}>
        {label && (
          <Label
            id={`${id}__label`}
            htmlFor={id}
            required={required}
            helper={helper}
            disabled={props.disabled}
            className="mb-1"
          >
            {label}
          </Label>
        )}
        <InputContainer
          className={clsx('bg-background-input', {
            'pr-0': !iconTrailing,
          })}
          error={error}
          disabled={props.disabled}
        >
          {iconLeading && (
            <span
              className={clsx('text-subtle', {
                'text-on-disabled': props.disabled,
              })}
            >
              {iconLeading}
            </span>
          )}
          <NumericFormat
            id={id}
            aria-required={required}
            aria-invalid={ariaInvalid}
            aria-describedby={hint ? `${id}__hint` : undefined}
            value={_value}
            onValueChange={handleValueChange}
            getInputRef={inputRef}
            className={twMerge(clsx(inputClassNames, inputClassName))}
            min={min}
            max={max}
            allowLeadingZeros={allowLeadingZeros}
            onKeyDown={(e) => {
              onKeyDown?.(e)
              if (e.key === 'ArrowDown') {
                onDecrement()
              }
              if (e.key === 'ArrowUp') {
                onIncrement()
              }
            }}
            onBlur={(e) => {
              onBlur?.(e)
              if (typeof _value === 'number') {
                const clampedValue = clamp(_value, min, max)
                if (clampedValue !== _value) {
                  _setValue(clampedValue)
                }
              }
            }}
            {...props}
            {...restProps}
          />
          {iconTrailing && (
            <span
              className={clsx('text-subtle', {
                'text-on-disabled': props.disabled,
              })}
            >
              {iconTrailing}
            </span>
          )}
          {showControls && (
            <div className="flex gap-1 items-center px-2">
              <button
                tabIndex={-1}
                onClick={(e) => {
                  e.preventDefault()
                  onDecrement()
                }}
                onTouchStart={(e) => {
                  if (e.cancelable) {
                    e.preventDefault()
                  }
                }}
                className="h-5 w-5 outline-none flex items-center justify-center text-secondary hover:text-foreground transition-all bg-neutral-accent active:bg-neutral-container hover:bg-neutral-accent active:text-foreground rounded-full aria-disabled:pointer-events-none aria-disabled:text-on-disabled"
                aria-label="Decrement"
              >
                <Minus
                  strokeWidth={2}
                  className="w-[10px] h-[10px]"
                />
              </button>

              <button
                tabIndex={-1}
                onClick={(e) => {
                  e.preventDefault()
                  onIncrement()
                }}
                onTouchStart={(e) => {
                  if (e.cancelable) {
                    e.preventDefault()
                  }
                }}
                className="h-5 w-5 flex outline-none items-center justify-center text-secondary hover:text-foreground transition-all bg-neutral-accent active:bg-neutral-container hover:bg-neutral-accent active:text-foreground rounded-full aria-disabled:pointer-events-none aria-disabled:text-on-disabled"
                aria-label="Increment"
              >
                <Plus strokeWidth={2} className="w-[10px] h-[10px]" />
              </button>
            </div>
          )}
        </InputContainer>
        {hint && (
          <Hint
            id={`${id}__hint`}
            error={error}
            className="mt-1"
            showIcon={showHintIcon}
            disabled={props.disabled}
          >
            {hint}
          </Hint>
        )}
        {error && (
          <Hint
            id={`${id}__hint`}
            error={error}
            className="mt-1"
            showIcon={showHintIcon}
            disabled={props.disabled}
          >
            {error}
          </Hint>
        )}
      </div>
    )
  }
)
NumberInput.displayName = 'NumberInput'

export default NumberInput
