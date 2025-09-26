import { cn } from '@/lib/utils'
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
      <div className="bg-background flex-1 h-full w-full max-w-[95rem] mx-auto flex gap-8 p-10 pb-10">
        <div className="flex-1 h-full w-full flex flex-col">
          {children}
        </div>
      </div>
    </div>
  )
}

export default InnerPageContainer
