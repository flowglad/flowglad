import { cn } from '@/lib/utils'

// TODO: Delete this file and replace with InnerPageContainerNew.tsx,
// then rename InnerPageContainerNew to InnerPageContainer.

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
      <div className=" h-full w-full max-w-[95rem] mx-auto flex gap-8 p-4 pb-10 md:p-10">
        <div className="h-full w-full flex flex-col">{children}</div>
      </div>
    </div>
  )
}

export default InnerPageContainer
