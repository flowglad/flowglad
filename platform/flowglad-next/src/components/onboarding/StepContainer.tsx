import { cn } from '@/lib/utils'

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
  return (
    <div
      className={cn(
        // Mobile: dynamic height (hug children) with bottom padding
        // Desktop (sm+): fixed height for consistent layout, no extra padding
        'flex flex-col gap-6 w-full justify-start',
        'pb-6 sm:pb-0 sm:h-[400px]',
        className
      )}
    >
      <div className="space-y-2 px-3">
        <h2 className="text-2xl tracking-tight">{title}</h2>
        {description && (
          <p className="text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}
