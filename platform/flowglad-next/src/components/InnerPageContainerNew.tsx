import { cn } from '@/lib/utils'

// TODO: This file will replace InternalPageContainer.tsx.
// Rename InnerPageContainerNew to InnerPageContainer after deletion.

const InnerPageContainerNew = ({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) => {
  return (
    <div
      className={cn(
        'h-full w-full flex-1 flex flex-col md:border-r md:border-dashed border-sidebar-border',
        className
      )}
    >
      {children}
    </div>
  )
}

export default InnerPageContainerNew
