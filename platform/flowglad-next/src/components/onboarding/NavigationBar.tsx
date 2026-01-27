// src/components/onboarding/NavigationBar.tsx
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { BottomBar, FixedBottomBar } from './BottomBar'
import { useMultiStepForm } from './MultiStepForm'
import { StepProgress } from './StepProgress'

interface NavigationBarProps {
  /** Label for back button. Defaults to "Back" */
  backLabel?: string
  /** Label for continue button. Defaults to "Continue" */
  continueLabel?: string
  /** Label for final step submit. Defaults to "Complete" */
  submitLabel?: string
  /** Custom action for back button (e.g., login redirect on first step) */
  onBackOverride?: () => void
  /** Custom back label for first step */
  firstStepBackLabel?: string
  /** Hide back button on first step */
  hideBackOnFirstStep?: boolean
  /** Whether to show progress indicator in the center */
  showProgress?: boolean
  /**
   * Whether to use fixed positioning at the bottom of the viewport.
   * - true (default): Fixed to viewport bottom, requires FixedBottomBarSpacer
   * - false: Flows with document, use with CSS Grid layout for full-bleed effect
   */
  fixed?: boolean
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
 * - Supports both fixed (viewport-anchored) and static (document flow) positioning
 */
export function NavigationBar({
  backLabel = 'Back',
  continueLabel = 'Continue',
  submitLabel = 'Complete',
  onBackOverride,
  firstStepBackLabel = 'Login',
  hideBackOnFirstStep = false,
  showProgress = false,
  fixed = true,
  className,
}: NavigationBarProps) {
  const {
    goToNext,
    goToPrevious,
    isFirstStep,
    isLastStep,
    form,
    canProceed,
  } = useMultiStepForm()

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

  const showBackButton = !(isFirstStep && hideBackOnFirstStep)

  // Button row content - shared between bordered and non-bordered layouts
  const buttonRow = (
    <div className="flex items-center justify-between py-2.5">
      {/* Back button - always rendered for consistent layout, invisible on first step */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleBack}
        disabled={isSubmitting}
        className={cn(!showBackButton && 'invisible')}
        aria-hidden={!showBackButton}
        tabIndex={showBackButton ? 0 : -1}
      >
        <ChevronLeft className="size-4" />
        <span>{displayBackLabel}</span>
      </Button>

      {/* Progress indicator - centered between buttons */}
      {showProgress ? (
        <StepProgress variant="meter" />
      ) : (
        <div /> /* Placeholder to maintain layout */
      )}

      {/* Continue/Submit button - uses existing Button component
          Note: goToNext() handles form validation before proceeding.
          On the last step, goToNext() triggers form submission via onComplete.
      */}
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={goToNext}
        disabled={isSubmitting || !canProceed}
      >
        {isSubmitting && <Loader2 className="size-4 animate-spin" />}
        <span>{isLastStep ? submitLabel : continueLabel}</span>
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )

  // Parent containers (OnboardingShell) handle borders - just render button row
  const content = buttonRow

  if (fixed) {
    return (
      <FixedBottomBar className={className}>{content}</FixedBottomBar>
    )
  }

  return <BottomBar className={className}>{content}</BottomBar>
}
