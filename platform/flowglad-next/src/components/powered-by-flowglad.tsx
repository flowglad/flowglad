import Link from 'next/link'
import FlowgladWordmark from '@/components/FlowgladWordmark'
import { cn } from '@/lib/utils'

interface PoweredByFlowgladProps {
  className?: string
}

export function PoweredByFlowglad({
  className,
}: PoweredByFlowgladProps) {
  return (
    <div
      className={cn(
        'h-5 w-full flex items-center gap-2 py-8 justify-center',
        className
      )}
    >
      <div
        className="text-sm font-medium text-center"
        style={{ color: '#374151' }}
      >
        Powered by
      </div>
      <Link href="https://flowglad.com">
        <FlowgladWordmark fill="#374151" />
      </Link>
    </div>
  )
}
