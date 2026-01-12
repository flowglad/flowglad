'use client'

import { cn } from '@/lib/utils'

interface SignupSideBarProps {
  className?: string
}

export function SignupSideBar({
  className = '',
}: SignupSideBarProps) {
  return (
    <div
      className={cn(
        'relative min-h-screen overflow-hidden',
        'border-l border-dashed border-primary-foreground/20',
        'bg-primary',
        className
      )}
    >
      {/* Placeholder for custom SVG - will be added later */}
      {/* <YourCustomSvg className="absolute inset-0" /> */}

      {/* Centered headline content */}
      <div className="absolute inset-0 flex items-center justify-center p-8">
        <div className="w-full max-w-xs text-center">
          <h1 className="text-4xl lg:text-5xl font-semibold text-primary-foreground tracking-tight leading-tight">
            Start Making Internet Money
          </h1>
          <p className="mt-4 text-lg text-primary-foreground/80 leading-relaxed">
            Make more sales, convert more customers, and grow faster.
          </p>
        </div>
      </div>
    </div>
  )
}
