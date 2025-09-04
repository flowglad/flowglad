'use client'

import { cn } from '@/lib/utils'
import FlowgladLogo from '@/components/FlowgladLogo'
import { useSearchParams } from 'next/navigation'

interface SignupSideBarProps {
  className?: string
}

export function SignupSideBar({
  className = '',
}: SignupSideBarProps) {
  const searchParams = useSearchParams()
  const flow = searchParams.get('flow')
  let tagline = 'Start Making Internet Money'
  let taglineDescription =
    'Make more sales, convert more customers, and grow faster.'

  return (
    <div
      className={cn(
        'bg-card flex-1 h-full w-full max-w-[512px] flex flex-col justify-center items-center gap-[175px] px-10 pt-[100px] pb-[60px] border-r border-border',
        className
      )}
    >
      <div className="w-full max-w-[372px] min-w-[328px] flex flex-col items-center gap-6 text-center">
        <FlowgladLogo />
        <div className="w-full flex flex-col gap-3">
          <div className="text-5xl leading-[54px] font-semibold text-foreground w-full max-w-[372px]">
            {tagline}
          </div>
          <div className="text-lg leading-6 text-muted-foreground w-full max-w-[372px]">
            {taglineDescription}
          </div>
        </div>
      </div>
    </div>
  )
}
