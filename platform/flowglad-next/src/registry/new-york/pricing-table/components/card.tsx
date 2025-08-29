import { cn } from '@/utils/core'

export function Card({ 
  className, 
  ...props 
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'bg-card text-card-foreground flex flex-col gap-6 rounded-xl border border-border py-6 shadow-sm',
        className
      )}
      {...props}
    />
  )
}