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
        'flex flex-col gap-6 w-full max-w-md mx-auto',
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
