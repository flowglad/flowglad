import { cn } from '@/lib/utils'

interface NarrowPageContainerProps {
  children: React.ReactNode
  className?: string
}

/**
 * Narrow centered container for single-column forms (onboarding, auth).
 *
 * Use this for focused form experiences where the full dashboard
 * width would feel too wide. Max-width: 38rem (608px).
 *
 * @example
 * <NarrowPageContainer>
 *   <OnboardingForm />
 * </NarrowPageContainer>
 */
const NarrowPageContainer = ({
  children,
  className,
}: NarrowPageContainerProps) => {
  return (
    <div
      className={cn(
        'h-full flex justify-between items-center gap-2.5',
        className
      )}
    >
      <div className="h-full w-full max-w-[38rem] mx-auto flex flex-col gap-8 p-4 pb-10 md:p-10">
        {children}
      </div>
    </div>
  )
}

export default NarrowPageContainer
