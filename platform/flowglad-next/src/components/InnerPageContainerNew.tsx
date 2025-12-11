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
      <div
        className="h-full w-full max-w-[38rem] mx-auto flex gap-8"
        style={{
          borderRightStyle: 'dashed',
          borderRightWidth: '1px',
          borderImageSlice: 1,
          borderImageRepeat: 'round',
          borderImageSource:
            'repeating-linear-gradient(to bottom, hsl(var(--sidebar-border)) 0, hsl(var(--sidebar-border)) 4px, transparent 4px, transparent 8px)',
        }}
      >
        <div className="h-full w-full flex flex-col">{children}</div>
      </div>
    </div>
  )
}

export default InnerPageContainerNew
