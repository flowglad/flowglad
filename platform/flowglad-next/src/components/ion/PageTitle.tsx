import { cn } from '@/utils/core'

const PageTitle = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => {
  return (
    <div
      className={cn(
        'text-4xl font-semibold text-on-primary-hover',
        className
      )}
    >
      {children}
    </div>
  )
}

export default PageTitle
