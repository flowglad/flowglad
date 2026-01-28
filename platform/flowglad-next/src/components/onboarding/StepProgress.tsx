import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useMultiStepForm } from './MultiStepForm'

interface StepProgressProps {
  variant?: 'bar' | 'dots' | 'steps' | 'meter'
  showStepCount?: boolean
  className?: string
}

export function StepProgress({
  variant = 'bar',
  showStepCount = true,
  className,
}: StepProgressProps) {
  const { currentStepIndex, totalSteps, progress, goToStep } =
    useMultiStepForm()

  if (variant === 'bar') {
    return (
      <div className={cn('space-y-2', className)}>
        <Progress value={progress} className="h-1" />
        {showStepCount && (
          <p className="text-xs text-muted-foreground text-center">
            Step {currentStepIndex + 1} of {totalSteps}
          </p>
        )}
      </div>
    )
  }

  if (variant === 'dots') {
    return (
      <div
        className={cn(
          'flex items-center justify-center gap-2',
          className
        )}
      >
        {Array.from({ length: totalSteps }).map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() =>
              index < currentStepIndex && goToStep(index)
            }
            disabled={index > currentStepIndex}
            className={cn(
              'w-2 h-2 rounded-full transition-all duration-200',
              index === currentStepIndex && 'w-6 bg-primary',
              index < currentStepIndex &&
                'bg-primary cursor-pointer hover:scale-110',
              index > currentStepIndex &&
                'bg-muted cursor-not-allowed'
            )}
            aria-label={`Step ${index + 1}`}
          />
        ))}
      </div>
    )
  }

  if (variant === 'meter') {
    return (
      <div
        className={cn(
          'flex items-center justify-center gap-1',
          className
        )}
      >
        {Array.from({ length: totalSteps }).map((_, index) => (
          <div
            key={index}
            className={cn(
              'w-1.5 h-3 rounded-full transition-colors duration-200',
              index <= currentStepIndex
                ? 'bg-foreground'
                : 'bg-secondary'
            )}
            aria-label={`Step ${index + 1}${index === currentStepIndex ? ' (current)' : ''}`}
          />
        ))}
      </div>
    )
  }

  // 'steps' variant - numbered circles
  return (
    <div
      className={cn('flex items-center justify-center', className)}
    >
      {Array.from({ length: totalSteps }).map((_, index) => (
        <div key={index} className="flex items-center">
          <button
            type="button"
            onClick={() =>
              index < currentStepIndex && goToStep(index)
            }
            disabled={index > currentStepIndex}
            className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all',
              index === currentStepIndex &&
                'bg-primary text-primary-foreground',
              index < currentStepIndex &&
                'bg-primary/20 text-primary cursor-pointer hover:bg-primary/30',
              index > currentStepIndex &&
                'bg-muted text-muted-foreground cursor-not-allowed'
            )}
          >
            {index + 1}
          </button>
          {index < totalSteps - 1 && (
            <div
              className={cn(
                'w-12 h-0.5 mx-1',
                index < currentStepIndex ? 'bg-primary' : 'bg-muted'
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}
