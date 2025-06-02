import { cn } from '@/utils/core'
const InnerPageContainer = ({
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
      <div className="bg-background flex-1 h-full w-full flex gap-8 p-6 pb-10">
        <div className="flex-1 h-full w-full flex flex-col">
          {children}
        </div>
      </div>
    </div>
  )
}

export default InnerPageContainer
