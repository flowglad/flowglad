// src/components/onboarding/FixedNavigationBar.tsx
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FixedBottomBar } from './FixedBottomBar'
import { useMultiStepForm } from './MultiStepForm'

interface FixedNavigationBarProps {
  /** Label for back button. Defaults to "Back" */
  backLabel?: string
  /** Label for continue button. Defaults to "Continue" */
  continueLabel?: string
  /** Label for final step submit. Defaults to "Complete" */
  submitLabel?: string
  /** Whether to show dashed borders on containers */
  showBorders?: boolean
  /** Custom action for back button (e.g., login redirect on first step) */
  onBackOverride?: () => void
  /** Custom back label for first step */
  firstStepBackLabel?: string
  className?: string
}

/**
 * Navigation bar for multi-step forms with back/continue buttons.
 * Must be used within a MultiStepForm component to access form context.
 *
 * Features:
 * - Back button with optional first-step override action
 * - Continue/Submit button that validates current step before proceeding
 * - Loading spinner during form submission
 * - Matches onboarding page container styling with dashed borders
 */
export function FixedNavigationBar({
  backLabel = 'Back',
  continueLabel = 'Continue',
  submitLabel = 'Complete',
  showBorders = true,
  onBackOverride,
  firstStepBackLabel = 'Login',
  className,
}: FixedNavigationBarProps) {
  const { goToNext, goToPrevious, isFirstStep, isLastStep, form } =
    useMultiStepForm()

  const { isSubmitting } = form.formState

  const handleBack = () => {
    if (isFirstStep && onBackOverride) {
      onBackOverride()
    } else {
      goToPrevious()
    }
  }

  const displayBackLabel =
    isFirstStep && onBackOverride ? firstStepBackLabel : backLabel

  return (
    <FixedBottomBar className={className}>
      <div className="flex items-center justify-center w-full">
        {/* Parent container: max-w-[608px] + px-4 (16px padding) */}
        <div
          className={cn(
            'w-full max-w-[608px] px-4',
            showBorders &&
              'border-l border-r border-dashed border-border'
          )}
        >
          {/* Inner container: fills parent + px-4 (16px padding) */}
          <div
            className={cn(
              'w-full px-4',
              showBorders &&
                'border-l border-r border-dashed border-border'
            )}
          >
            {/* Content area: py-2.5 for vertical padding, flex for button layout */}
            <div className="flex items-center justify-between py-2.5">
              {/* Back button - uses existing Button component */}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleBack}
                disabled={isSubmitting}
                className="rounded-full"
              >
                <ArrowLeft className="size-4" />
                <span>{displayBackLabel}</span>
              </Button>

              {/* Continue/Submit button - uses existing Button component
                  Note: goToNext() handles form validation before proceeding.
                  On the last step, goToNext() triggers form submission via onComplete.
              */}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={goToNext}
                disabled={isSubmitting}
                className="rounded-full"
              >
                {isSubmitting && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                <span>
                  {isLastStep ? submitLabel : continueLabel}
                </span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </FixedBottomBar>
  )
}
