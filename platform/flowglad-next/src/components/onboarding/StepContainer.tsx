import { cn } from '@/lib/utils'
import { useMultiStepForm } from './MultiStepForm'

interface StepContainerProps {
  children: React.ReactNode
  title: string
  description?: string
  className?: string
}

export function StepContainer({
  children,
  title,
  description,
  className,
}: StepContainerProps) {
  const { direction } = useMultiStepForm()

  // Direction-aware animations
  const animationClass = {
    initial: 'animate-in fade-in duration-300',
    forward: 'animate-in fade-in slide-in-from-right-4 duration-300',
    backward: 'animate-in fade-in slide-in-from-left-4 duration-300',
  }[direction]

  return (
    <div
      className={cn(
        'flex flex-col gap-6 w-full max-w-md mx-auto',
        animationClass,
        className
      )}
    >
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}
