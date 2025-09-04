import Link from 'next/link'
import { Lock } from 'lucide-react'
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
      <Lock size={16} className="text-muted-foreground" />
      <div className="text-sm font-medium text-center text-muted-foreground">
        Powered by
      </div>
      <Link href="https://flowglad.com">
        <FlowgladWordmark fill="rgba(255, 255, 255, 0.5)" />
      </Link>
    </div>
  )
}
