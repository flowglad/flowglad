// ion/Hint: Generated with Ion on 9/20/2024, 3:49:00 PM
import { Info } from 'lucide-react'
import clsx from 'clsx'

/* ---------------------------------- Type --------------------------------- */

interface HintProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Display hint icon to the left of the hint
   * @default false
   */
  showIcon?: boolean
  /** Display the hint with an error state */
  error?: boolean | string
  /** Display the hint with a disabled state */
  disabled?: boolean
}

/* ---------------------------------- Component --------------------------------- */

function Hint({
  className,
  children,
  error,
  showIcon = false,
  disabled,
  ...props
}: HintProps) {
  return (
    <p
      className={clsx(
        'flex items-center gap-1 text-xs text-subtle mt-1',
        {
          'text-danger': error,
          'text-muted-foreground': !error && !disabled,
          'text-on-disabled': disabled,
        },
        className
      )}
      {...props}
    >
      {showIcon && <Info className="h-3 w-3" strokeWidth={2} />}
      {children}
    </p>
  )
}

export default Hint
