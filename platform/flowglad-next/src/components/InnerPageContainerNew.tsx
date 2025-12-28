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
        'h-full flex justify-between items-center gap-2.5',
        className
      )}
    >
      <div className="h-full w-full max-w-[38rem] mx-auto flex gap-8 border-l border-r border-dashed border-sidebar-border">
        <div className="h-full w-full flex flex-col">{children}</div>
      </div>
    </div>
  )
}

export default InnerPageContainerNew
